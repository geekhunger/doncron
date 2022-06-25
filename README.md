# Cronjobs with simpler timestamp syntax!

Have you ever used cronjobs and their timer syntax? They are horrible!

And worst of all: Sometimes it's not only tricky but even impossible to define two or more executions of the same job because one timer can't express it all! Instead you'd need to setup multiple schedules manually.

This is where this module comes into play... It consits of two parts. Part No.1 is its `node-cron` dependency, which is used to physically 'install' your cronjobs on your machine. Part No.2, the heart of this module, is the timestamp parser. - The parser basically tries to merge multiple timers into a single one or to split your preferences across as little timers as possible.

The timestamp parser offers you a much simpler but more powerful syntax for defining your cronjob timer by using the fallowing functions:

- `month(day, ...months)` for running monthly routines, which allows you to select the month and a day of the 
- `weekday(...weekdays)` for running weekly tasks, which allows you to select the day of the week of job execution.
- `time(hour, minute, second)` for running daily jobs, which allows you to select an hour, minute and second of the job execution.

By combining those functions, you can express any variation or combination of a timestamp that you like. The module will then automatically merge (or split) all of your preferences into as little scheduled cronjobs as possible and set them up for you.

You can also have a look at the source. It's very well documented and contains some additional information, if you feel the need to dig deeper.

Here's how a *raw* `node-cron` call (and its timer definition) would look like:

```txt
          .––––––––––––– second       [0-59] optional
          | .––––––––––– minute       [0-59]
          | | .––––––––– hour         [0-23]
          | | | .––––––– day of month [1-31]
          | | | | .––––– month        [1-12] or names, e.g. jan, january
          | | | | | .––– day of week  [0-7]  or names, e.g. tuesday (0|7 is sunday)
          | | | | | |
schedule("* * * * * *", fn, opt)
                         |   |
                         |   `––– options, e.g. {scheduled: true, timezone: "Europe/Berlin"}
                         `––––––– handler function (the job itself)
```

In contrast to that, here's how *this module* handles it:

```js
schedule({
    name: "The name of your cronjob or some sort of identifier",
    handler: require("./your/module"),
    timestamp: [
        time(10, 05), // first daily execution
        time(22, 05)  // second daily execution
    ]
})
```

You can define your cronjobs where and however you like, but I prefer to have a central file for my cronjob definitions, most of the time. I often call it `cron.js` and put my definitions in there.

```js
const process = require("process")
const masternode = new RegExp("(master|primary|manager|lead|main)", "i").test(process.env.name)

const {time, weekday, month, schedule} = module.exports = require("schedule") // NOTE the `module.exports` here!

schedule({
    name: "Backup all of my databases",
    handler: require("./dbbackups"),
    timestamp: [      // run task for every node/instance of the server (if there are more than one)
        time(10, 00), // fire it twice a day, at 10AM and at 10PM
        time(22, 00),
        month(15)     // but only for every 15-th OF EVERY month!
                      // meaning: 12 x 2 = 24 executions in a year
    ]
})

schedule({
    name: "auto-renew my ssl certs",
    allowed: masternode, // run this cron only on main (master) server node!
    handler: rootpath.require("./ssl").renew,
    timestamp: [
        time(01, 00),
        weekday("sunday") // run task on every sunday at 1AM!
    ]
})
```

Then, before I finally boot my ExpressJS application, I call out for `require("cronjob").activate()` to activate all of my defined cronjobs. That's it.

