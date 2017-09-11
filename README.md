# node-red-contrib-interval-length
A Node Red node to measure the interval length between successive messages

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-interval-length
```

## Node Usage

This node measures time intervals between messages that arrive on it's input port.

When msg1 arrives, the node will start counting (milliseconds).  As soon as msg2 arrives, the node will create an output message msg3 with `msg.payload` containing the time interval:

![Timeline](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_timeline.png)

## Node configuration

### Format
The interval length in the output `msg.payload` can be formatted in a number of ways:
* `Milliseconds` : format as simple number (i.e. no formatting).
* `Human readable` : format in a human readable format like *1d:7h:0m:0s*.
* `JSON object` : format as a JSON object like *{ minutes: 23, seconds: 20, milliseconds: 1 }*

### Topic dependent
When this option is selected, the intervals will be measured for each topic separately.  E.g. suppose following sequence arrives:

![Topics](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_topics.png)

As soon as msg3 arrives, an output message msg4 will be generated which contains in it's payload field:
- In case of *topic independant* : milliseconds between msg2 and msg3 ( = Y ).  
- In case of *topic dependant* : milliseconds between msg1 and msg3 ( = Y + X ).

## Maximum
When a maximum value is specified, intervals longer than this value will be ignored (i.e. won't result in an output message).

Use case: suppose we want to measure the length of a spike arriving on a GPIO input port:
![Spike graph](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_spike_graph.png)

Measuring the length of the spike is in fact nothing more than calculating the time interval between two messages: the rising and falling edge.  This can be done easily using following flow:

![Spike flow](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_spike_flow.png)

```
[{"id":"b29758e9.9bc458","type":"function","z":"4900f0c0.a1ad6","name":"Generate spike","func":"node.send({payload: 1});\n\nvar interval = setInterval(function() {\n    clearInterval(interval);\n\tnode.send({payload: 0});\n}, msg.payload); \n\nreturn null;","outputs":1,"noerr":0,"x":587.6666221618652,"y":828.6666488647461,"wires":[["be2e833a.873ad"]]},{"id":"faff9ee0.2ce6b","type":"inject","z":"4900f0c0.a1ad6","name":"10 milliseconds","topic":"","payload":"10","payloadType":"num","repeat":"","crontab":"","once":false,"x":389.6666946411133,"y":828.6666955947876,"wires":[["b29758e9.9bc458"]]},{"id":"d6f39042.73dd3","type":"debug","z":"4900f0c0.a1ad6","name":"Display interval","active":true,"console":"false","complete":"payload","x":996.6666870117188,"y":827.9999465942383,"wires":[]},{"id":"81dcfcdc.c637c","type":"inject","z":"4900f0c0.a1ad6","name":"1 milliseconds","topic":"","payload":"1","payloadType":"num","repeat":"","crontab":"","once":false,"x":379.66665267944336,"y":777.6666488647461,"wires":[["b29758e9.9bc458"]]},{"id":"aa2397c6.1416b8","type":"inject","z":"4900f0c0.a1ad6","name":"100 milliseconds","topic":"","payload":"100","payloadType":"num","repeat":"","crontab":"","once":false,"x":386.66665267944336,"y":881.3333358764648,"wires":[["b29758e9.9bc458"]]},{"id":"be2e833a.873ad","type":"interval-length","z":"4900f0c0.a1ad6","format":"mills","bytopic":false,"minimum":"","maximum":"","window":"","timeout":false,"minimumunit":"secs","maximumunit":"msecs","windowunit":"secs","startup":false,"name":"","x":792,"y":828,"wires":[["d6f39042.73dd3"]]}]
```

However the node is not only measuring the lenth of the spike itself (X), but it will also measure the time interval between the succesive spikes (Y):

![Spike debug](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_spike_debug.png)

In this case we are only interested in measuring the spikes themselves: by specifying a maximum value of e.g. 100 msecs, only the spike lengths will be measured.

## Minimum
When a minimum value is specified, intervals shorter than this value will be ignored (i.e. won't result in an output message).  This can be used e.g. when you are only interested in large intervals, and all the short intervals should be ignored.

## Window
When a window length is specified, all intervals (between messages that arrive during that time window) will be accumulated (and send as a single output message).

In following example 4 messages (msg1, msg2, msg3, msg4) occur during the time window (of N milliseconds).  When the time window is ended, the `msg.payload` of the generated output message will contain the sum of all intervals between those messages (X + Y + Z):

![Window](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_zoom.png)

When the time window is passed, a new time window will be created underneath as soon as the first messages arrives afterwards.

Use case : physical button is connected to a GPIO port.  When the button is pressed, the signal will start to bounce during a short time period:

![Bounce graph](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_bounce_graph.png)

The RPIO-GPIO-in node allows to specify a **debounce** interval, to get rid of these glitches.  However it would be nice if we could measure the length of the bouncing interval (and repeat that measurement a number of times) to determine precisely at which length the debouncer should setup.

To avoid having to sum manually all the individual interval lengths (generated by this node), it is easier to specify a window of (e.g.) 400 msecs: the node will start counting at the first edge (i.e. when the button is pressed) and it will sum all time intervals that arrive inside the specified time window:

![Bounce flow](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-interval-length/master/images/interval_bounce_flow.png)

```
[{"id":"fffc74b6.0171e8","type":"function","z":"4900f0c0.a1ad6","name":"Generate bounce","func":"var i = 0;\nvar value = 1;\n\nvar interval = setInterval(function() {\n  node.send({payload: value});\n  value = (value === 1) ? 0 : 1;\n  if (++i === 10) clearInterval(interval);\n}, msg.payload);","outputs":1,"noerr":0,"x":592,"y":1000,"wires":[["ba9b6498.46acb8"]]},{"id":"2b611a6c.9d0666","type":"inject","z":"4900f0c0.a1ad6","name":"10 milliseconds","topic":"","payload":"10","payloadType":"num","repeat":"","crontab":"","once":false,"x":382.00007247924805,"y":1000.0000467300415,"wires":[["fffc74b6.0171e8"]]},{"id":"454c08c6.8e57c8","type":"debug","z":"4900f0c0.a1ad6","name":"Display interval","active":true,"console":"false","complete":"payload","x":1020,"y":1000,"wires":[]},{"id":"ba9b6498.46acb8","type":"interval-length","z":"4900f0c0.a1ad6","format":"mills","bytopic":false,"minimum":"","maximum":"","window":"3","timeout":false,"windowunit":"secs","startup":false,"name":"","x":816,"y":1000.3203125,"wires":[["454c08c6.8e57c8"]]}]
```

## Create msg at timeout
When a time window is specified, at the end of the time window a single message will be generated containing the sum of all intervals (of all messages that arrived during the time window).  However when no messages arrive during the time window, **no** message is being generated.  When this option is selected, an extra message (containing a '0' interval) will be generated at the end of the window (when no messages have arrived).

This option could be used to make sure that messages arrive with a maximum interval in between them.  E.g. when you expect some device to send a value every minute, and want to generate an alarm when this doesn't happen.

## Start measurement at startup
When this option is selected, the node will start counting at flow startup. A message will be generated even when the first message arrives: this first time interval is calculated between system startup (e.g. flow deploy or redeploy) and the arrival time of the first message.

When this option is deselected, the node will start counting only when the first message arrives. So the interval can only be calculated as soon as the second message arrives.  Which means that no output message is generated when the first message arrives...