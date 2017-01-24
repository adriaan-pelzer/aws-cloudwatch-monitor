#aws-cloudwatch-monitor

##Monitor decreasing cloudwatch metrics by calculating how long it will take them to reach a specified set of thresholds

_*NOTE:* This only tracks decreasing thresholds, not increasing thresholds. The defaults sketch the typical use case, namely Freeable Memory in a ElastiCache cache node_

###INSTALL

```
    sudo npm install -g aws-cloudwatch-monitor
```

###USE

```
    Usage: aws-cloudwatch-monitor [namespace [metric [days [snstopic [threshold [limit1 limit2 ...]]]]]]
        namespace   The namespace of the AWS service to run the monitor against (AWS/ElastiCache)
        metric      The name of the metric to monitor (FreeableMemory)
        days        The number of days to run the comparison across (7)
        snstopic    The arn of an sns topic to notify of instances that have crossed the threshold
        threshold   The number of days to allow until breaching one of the limits (30)
        limitN      A list of numeric limits to check the metric against (0)

        /* Any parameter can be omitted, either by omitting it, or by specifying it as a dash (-) */
        /* All omitted parameters will assume the default value, if applicable */
```

aws-cloudwatch-monitor queries the AWS API for all Cloudwatch Metrics in the provided *namespace* that matches the provided *metric* name. Using the highest available granularity (1 minute), it then gets two values for each metric: the latest one, and one from the specified amount of *days* ago. This is then used to estimate how many days it will take for each metric to reach a list of limits, and these are then printed to the console as a list of logs with the following format:

```
    Dimension1=Value1, Dimension2=Value2, ... | limit1:estimate1[:!!!], limit2:estimate2[:!!!], ...
```

The Dimension/Value pairs serve to identify each metric. Each *limit* specified on the command line will then result in a limit/estimate pair in the log line, with a ":!!!" append if the estimate has breached (is smaller then) the *threshold*.

If *snstopic* is specified, all log lines that contains an estimate which has crossed the *threshold*, will be sent to the specified SNS topic with the subject line _CloudWatch - days left until threshold_
