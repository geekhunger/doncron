/*
    This module makes with scheduled timings much easier
    The module provides helper function that abstract away the weird syntax
    that cronjob timer are using (as shown in the cheatsheet below)

    Each helper (daily, weekly, monthly, ...) will generate a fixed and distinct timestamp (no comma-separated values)
    and the resulting strings can then be merged together to create more sophisticated schedules
    See usage examples below as each helper is well documented
*/

///////////////////////////////////////////////////////////////////////////////////////////////////
//                      Here's a cheatsheet for using cronjob schedulers:
///////////////////////////////////////////////////////////////////////////////////////////////////
//   
//               ,––––––––––––– second       [0-59] optional
//               | ,––––––––––– minute       [0-59]
//               | | ,––––––––– hour         [0-23]
//               | | | ,––––––– day of month [1-31]
//               | | | | ,––––– month        [1-12] or names, e.g. jan, january
//               | | | | | ,––– day of week  [0-7]  or names, e.g. tuesday (0|7 is sunday)
//               | | | | | |
//    .schedule("* * * * * *", fn, opt)
//                              |   |
//                              |   `––– options, e.g. {scheduled: true, timezone: "Europe/Berlin"}
//                              `––––––– handler function
///////////////////////////////////////////////////////////////////////////////////////////////////

const {check: type, assert} = require("type-approve")
const {validate, schedule} = require("node-cron")

const process = require("process")
const PID = process.pid
const APN = process.env.name




/*
    Cut an integer at upper and lower bounds to fit it inside the given min and max
    An interesting coincedence is that it can handle numbers, strings that can be parsed to number and even arrays (takes [0])
    e.g.
        clamp(60, 0, 59)            // 59 because grater than max
        clamp(09, 0, 9)             // 9  perfectly in bounds
        clamp([5, 10, 20], 0, 23)   // 5  perfectly in bounds
        clamp(-1, 0, 1)             // 0  because less than min
        clamp(3)                    // 1  because grater than default max of 1
*/
const clamp = function(int, min = 0, max = 1) {
    return Math.min(parseInt(max), Math.max(parseInt(min), parseInt(int || min)))
}


/*
    Discard all duplicate values from a schedule timer string
    The values are converted into a series of arrays (slots) then filtered and joined back into a timer string
*/
const unique = function(str) {
    return str
        .split(" ")
        .map(slot => slot
            .split(",")
            .filter((value, index, self) => self.indexOf(value) === index)
            .join(",")
        )
        .join(" ")
}



/*
    Sort values of a schedule timer string
    The values are converted into a series of arrays (slots) then sorted and joined back into a timer string
*/
const sorted = function(str) {
    return str
        .split(" ")
        .map(slot => slot
            .split(",")
            .sort((a, b) => a - b)
            .join(",")
        )
        .join(" ")
}



/*
    Takes multiple timer strings and compiles them into a single schedule timer
    NOTE
        This is a rather 'private' version of the function.
        It does not discard duplicate values and does not sort them!
        For regular enduser usage, use the join() function call!
*/
const compile = function(...source) {
    const output = "0 0 0 0 0 0".split(" ").reverse() // default timer
    const input = source.map(timer => {
        return timer
            .replace(/^([0]\s?)*/, "") // remove leading zeros
            .split(" ")
            .reverse()
    })
    for(const [slot, value] of output.entries()) {
        let buffer = []
        for(let timer = 0; timer < source.length; timer++) {
            if(input[timer][slot]) {
                /*if(slot === 4) buffer.splice(0, buffer.length, input[timer][slot].split(",")[0]) // merge minutes
                else*/ buffer.push(...input[timer][slot].split(","))
            }
        }
        output[slot] = buffer
            .join(",")
            .replace(/(,\*|\*,)/g, "") // discard wildcards (*) if they're not the only value
            .replace(/^[^\*\d,]*$/, value) // fall back to default timer value if there's none
    }
    return output.reverse().join(" ")
}



/*
    Takes multiple timer strings and compiles them into a single schedule timer

    NOTE
        This is basically the compile() function but for 'public' use!
        It merges schedule timers into one single string
        and also discards duplicate values in the slots
        and also sorts the values in ascending order.
    
    For example:
        join(
            monthly("jun"),     // '0 0 0 1 6 *'
            monthly("dec"),     // '0 0 0 1 12 *'
            weekly("monday"),   // '0 0 0 * * 1'
            weekly("friday"),   // '0 0 0 * * 5'
            daily(09, 30),      // '0 30 9 * * *'
            daily(07, 00)       // '0 0 7 * * *'
        )                       // '0 30 7,9 1 6,12 1,5' (merged from all of the above)
    
        NOTE, that it has evaluated to 09:30AM and 07:30AM (instead of 07:00AM)!
        This happens because all leading zeros are stripped behind the scenes,
        which is why this minute setting is missing in the resulting timer string.
        A compromise I had to make in order to be able to compile all other edge-cases.
        
        To FIX this, simply subtract 1 second and use `daily(06, 59)`
        The result becomes more predictable '0 30,59 6,9 1 6,12 1,5'

        However, this may not be the expected schedule timer
        because instead of running at 06:59AM and 09:30AM
        it would rather run at 06:30AM, 06:59AM, 09:30AM and 09:59AM!

        To force the desired behaviour you'd need to setup two separate timers
        ['0 59 6 1 6,12 1,5', '0 30 9 1 6,12 1,5'] and simply use the same handler on both.
        In most cases it's better to split the schedule into two distinct schedules anyways
        e.g.
            const first = join(
                monthly("jun"),
                weekly(["monday", "friday"]),
                daily(09, 30),
            )
            const second = join(
                monthly("dec"),
                weekly(["monday", "friday"]),
                daily(07, 00)
            )
*/
const join = function(...source) {
    return sorted(unique(compile(...source)))
}



/*
    Takes a timer string and identifies comma-separated values in it
    Then splits provided timer string out into separate timer strings from those comma-separated values

    Basically the opposite operation of join()
    For example, split('0 30,59 12,7 * * *') becomes ['0 30 12 * * *', '0 59 7 * * *']

    A use-case when this function comes in handy would be if you join() multiple daily() statements
    and the resulting timer string has multiple (comma-separated) values for minutes!
*/
const split = function(source) {
    const input = source.split(" ").reverse()
    const day_month_weekday = input.slice(0, 3).map(slot => sorted(unique(slot)))
    const hour = input[3].split(",")
    const minute = input[4].split(",")
    const second = (input[5] || "0").split(",")
    const splits = Math.max(hour.length, minute.length, second.length)
    const output = [...new Array(splits)].map(() => [...day_month_weekday])
    /*
        NOTE
        `let output = new Array(splits).fill(day_month_weekday)` would have been a joyful solution
        but for some strange reasons this didn't work because subsequent `push(hour[i])` calls
        had basically unpacked the entire hour array into BOTH of the new arrays created by the fill!

        I tried to create genuine fill values by `let output = new Array(splits).fill([...day_month_weekday])`
        but this didn't work either.

        More conservative solutions suggested using common loops and it finally worked:
            let output = []
            for(let i = 0; i < splits; i++) output.push([...day_month_weekday])
        
        More exotic solutions suggested using a combination of new Array, spread syntax, apply, aplit, map and others...
        I finally settled on `let output = [...new Array(splits)].map(() => [...day_month_weekday])`
        as it's the most concise and readable solution I could come up with.
    */
    for(let i = 0; i < splits; i++) output[i].push(hour[i]   || "*")
    for(let i = 0; i < splits; i++) output[i].push(minute[i] || "*")
    for(let i = 0; i < splits; i++) output[i].push(second[i] || "*")

    for(let count = 0; count < output.length; count++) {
        for(let pos = output[count].length - 1; pos >= 0; pos--) {
            if(output[count][pos] === "*") output[count][pos] = "0"
            else break
        }
    }

    return output
        .map((param) => param
            .reverse()
            .join(" ")
        )
}



/*
    Run timer helper multiple times with different function parameters
    and merge the resulting schedule timers
    e.g.
        repeat(
            weekly,
            ["monday", "wednesday", "friday"]
        )
        // weekly("mon")        results in '0 0 0 * * 1'
        // weekly("wed")        results in '0 0 0 * * 3'
        // weekly("fri")        results in '0 0 0 * * 5'
        // merged return value  results in '0 0 0 * * 1,3,5'
*/
const repeat = function(fn, ...param) {
    const result = []
    for(const args of param) {
        if(Array.isArray(args)) result.push(fn(...args))
        else result.push(fn(args))
    }
    return join(...result)
}



/*
    Convenient shortcut to define a cronjob timer that will run one or multiple times daily
    Btw, hour and minute parameters are both optional actually because they both default to 0
    e.g.
        daily(07, 15)               // 1x at 7:15AM
        daily(12)                   // 1x at 12:00AM (minutes default to 0)
        daily([14, 07, 23])         // 3x at 7:00AM  (always first value choosen for hours)
        daily(16, [5, 15])          // 1x at 16:05PM (always first value choosen for minutes)
        daily([5, 0], [0, 15, 30])  // 2x at 05:00AM
        daily()                     // 1x at 00:00AM (hours and minutes default to 0)
    
    NOTE
        Every helper (daily, weekly, monthly, ...) can be used on their own without any side effects
        but they can also be joined together via compile() / join() to form one single schedule string!

        Normally all works as expected and without any side-effects. However, if compile/join receives
        multiple daily() statements, then it struggles to merge. Especially when those timestamps contain
        zeros for hours, minutes and seconds, e.g. timestamps like 00:00AM or 05:00AM!
    
    POTENTIAL ISSUE
        While looking at all of the timer strings that the merger has to process, it simply doesn't know
        if a leading zero in the timer string is an intended user setting or if it's just a leftover from another call,
        like weekly(). Calls to weekly() to indeed set some leading zeros (second, minute, hour) by default
        because if that schedule string would be passed onto a cronjob without them, then the weekly schedule created by weekly()
        would in reality be called for every hour, minute and second, as the default param is a '*' wildcard!
        To prevent that, we set hour, minute and second to zero, which again, is an issue when merging multiple timer strings.
        
        A simple solution to this problem is to always avoid setting zero for hours or minutes in daily() function call!
        Instead of `daily(0, 0)` set it to `daily(23, 59)`.
    
    SOLUTION
        Another, even better, solution would be to ALWAYS set seconds between [1-59] and never to zero!
        This way the timer string will never have leading zeros that could be 'cut' in the merging process and you'll
        always have perfect merging without skipping timers or having side-effects!
*/
const daily = function(hour = 23, minute = 59, second = 59) {
    return `${clamp(second, 1, 59)} ${clamp(minute, 0, 59)} ${clamp(hour, 0, 23)} * * *`
}



/*
    Convenient shortcut to define a cronjob timer that will run one or multiple times weekly
    The weekday can be a number [0-7], an abbreviation or the full day name (see cheatsheet)
    You can pass a single weekday or an array of multiple and combine the notation [1, "tue", "wednesday"]
    e.g.
        weekly()                    // 1x on sunday    at 00:00AM
        weekly("sunday")            // 1x on sunday    at midnight
        weekly("wed", 1, "friday")  // 1x on monday    at midnight,
                                    // 2x on wednesday at midnight,
                                    // 2x on friday    at midnight
    
    Use `join(weekly("saturday"), daily(09, 30))` to add an exact time to your weekly schedule timer
    For example:
        join(weekly("saturday", "wed"), daily(6, 30))   // 1x on wednesday at 06:30AM,
                                                        // 1x on saturday  at 06:30AM
*/
const weekly = function(...weekday) {
    if(weekday.length > 1) return repeat(weekly, ...weekday)
    const index = parseInt([
        /^(0|sun(day)?)$/i,
        /^(1|mon(day)?)$/i,
        /^(2|tue(sday)?)$/i,
        /^(3|wed(nesday)?)$/i,
        /^(4|thu(rsday)?)$/i,
        /^(5|fri(day)?)$/i,
        /^(6|sat(urday)?)$/i,
        /^(7|sun(day)?)$/i
    ].findIndex(pattern => pattern.test(weekday[0]))) // convert day from number or string into an index [0-7]
    return `0 0 0 * * ${index >= 0 ? index : "*"}` // ignore unknown weekdays
}



/*
    Very similar to weekly() but additionally to the month index or name you can pass the day as well
    Example:
        monthly(1, "jan", "march")  // 1x on every 1st january
                                    // 1x on every 1st march
    
    You can add an exact time to the schedule the same way as already mentioned above
    `join(monthly(null, "january"), daily(03, 33))` will run every the cronjob every january at 03:33AM
*/
const monthly = function(day = 1, ...month) {
    if(month.length > 1) return repeat(monthly, ...month.map(name => [day, name]))
    const month_index = parseInt([
        /^(1|jan(nuary)?)$/i,
        /^(2|feb(ruary)?)$/i,
        /^(3|mar(ch)?)$/i,
        /^(4|apr(il)?)$/i,
        /^(5|may)$/i,
        /^(6|june?)$/i,
        /^(7|july?)$/i,
        /^(8|aug(ust)?)$/i,
        /^(9|sep(tember)?)$/i,
        /^(10|oct(ober)?)$/i,
        /^(11|nov(ember)?)$/i,
        /^(12|dec(ember)?)$/i
    ].findIndex(pattern => pattern.test(month[0])) + 1) // convert month from number or string into an index [1-12]
    return `0 0 0 ${clamp(day, 1, 31)} ${month_index > 0 ? month_index : "*"} *` // ignore unknown months
}



const create = function(option) {
    assert(type({string: option.name}), `Scheduler couldn't setup task without a description (name)!`)
    assert(type({function: option.handler}), `Scheduler couldn't setup task '${option.name}' without a handler function!`)

    /*
        IMPORTANT NOTE
        Cronjobs should only run on one instance of the same server, which is the 'master' node!
        @option.allowed can be used to set the appropriate flag and run (or or not run) the job,
        for example by checking the server node like so:
        const masternode = new RegExp("(master|primary|manager|lead|main)", "i").test(process.env.name)
    */
    option.allowed = type({boolean: option.allowed}) ? option.allowed : true
    option.perpetual = type({boolean: option.perpetual}) ? option.perpetual : this.common_settings.perpetual
    option.timezone = type({string: option.timezone}) ? option.timezone : this.common_settings.timezone
    option.autorun = !!option.autorun
    option.timestamp = type({array: option.timestamp}) ? option.timestamp : [option.timestamp] // convert to array

    const part = split(compile(...option.timestamp)) // split timer string into separate timer automatically to avoid collisions and unexpected behaviour

    for(let [count, timer] of part.entries()) { // setup one cronjob per timer string
        assert(validate(timer), `Scheduler couldn't setup task '${option.name}' because of invalid inverval timer '${timer}'!`)
        if(option.autorun && count === 0) {
            option.handler()
        }
        this.queue.push({
            id: `${option.name}${part.length > 1 ? ` (no.${count + 1})` : ""}`,
            ts: timer,
            allowed: option.allowed,
            task: schedule(timer, option.handler, {scheduled: !option.perpetual, timezone: option.timezone})
        })
    }
    
    return this
}



const start = function(name) {
    let queue = this.queue
    if(typeof name === "string" && name.length > 0) {
        const search_regex = new RegExp("^" + name)
        queue = queue.filter(task => search_regex.test(task.id)) // one job could be split into multiple parts (timers)
    }
    if(queue.length > 0) {
        console.log(`Scheduling ${queue.length}/${this.queue.length} tasks on application server with PID ${PID}...`)
        for(const job of queue) {
            if(job.allowed) {
                job.task.start()
                console.log(`Scheduler started running task '${job.id}' at invervals of '${job.ts}' on application server with PID ${PID} and name '${APN}'.`)
            } else {
                console.info(`Scheduler skipped starting forbidden task '${job.id}' on application server with PID ${PID}.`)
            }
        }
        console.log(`Scheduled ${queue.filter(task => task.allowed).length}/${queue.length} tasks on application server with PID ${PID}.`)
    }
    return this
    // NOTE: .stop() isn't very useful for tasks that run forever but you could always access the handler from module.exports!
    // EXAMPLE: const jobs = ROOTPATH.require("job/core/schedule"); jobs["task-name"].stop()
}



const stop = function(name) {
    let queue = this.queue.filter(task => task.allowed) // we know that only allowed tasks can be running!
    if(typeof name === "string" && name.length > 0) {
        const search_regex = new RegExp("^" + name)
        queue = queue.filter(task => search_regex.test(task.id))
    }
    if(queue.length > 0) {
        console.log(`Stopping ${queue.length} scheduled tasks on application server with PID ${PID}...`)
        for(const job of queue) {
            job.task.stop() // NOTE: .destroy() method is not available, as stated by the docs!
            console.info(`Scheduler stopped running '${job.id}' at invervals of '${job.ts}' on application server with PID ${PID} and name '${APN}'.`)
        }
        console.log(`Scheduled tasks on application server with PID ${PID} have been stopped.`)
    }
    return this
}



/*
    NOTE ABOUT BINDING `this`
        FORGET ARROW FUNCTIONS ALTOGETHER! They don't work in this case, as 'this' is already bound
        (at definition time), even before you call them. Use regular function call instead!

        You might be tempted to simply `{schedule: function(param) {return private_fn.call(this, param)}}`
        BUT BE AWARE that this will ONLY WORK WITH `const cron = ROOTPATH.require("schedule"); console.log(cron.schedule);`
        and NOT WITH `const {schedule} = ROOTPATH.require("schedule"); console.log(schedule);`!
        (.apply() won't work either...)

        What seems to work, is to reference `module.exports` instead. A shorthand like `const self = module.exports = {}`
        may be more convenient. This way you can keep using `return private_fn.call(self, param)` binding.
        This also works for both module inclusion methods `const {schedule} = require()` and `const cron = require()`
    
    REASONING
        Why I even bother binding? Why not make a namespace, pack everything inside it and export?
        Because this ways I can have 'private' functions that have their own naming and logic and 'rewire'
        then for the 'public' use as I want. Plus, it looks cleaner.
*/
let self = module.exports = {
    time: daily,
    weekday: weekly,
    month: monthly,
    merge: join, // flatten multiple timestamps into a single string
    join: (...timer) => split(compile(...timer)), // most user-friedly and smart option!
    queue: [],
    common_settings: {
        perpetual: false, // repeat over-and-over, or run only once
        timezone: "Europe/Berlin" //new Intl.DateTimeFormat().resolvedOptions().timeZone // auto-detect current timezone
    },
    schedule: function(options) {return create.call(self, options)},
    activate: function(name) {return start.call(self, name)},
    deactivate: function(name) {return stop.call(self, name)}
}
