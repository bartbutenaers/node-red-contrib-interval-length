/**
 * Copyright 2017 Bart Butenaers
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
 module.exports = function(RED) {
     "use strict";
    var settings = RED.settings;  
    const humanizer = require('pretty-ms');
    const jsonizer = require('parse-ms');
    
    function sendMsg(node, msg, interval, output) {
        var outputValue;
        
        // Send timeout messages (on output 2) anyway
        if (output !== 2) {
            if (interval.millisecs == 0 && node.timeout == false) {
                // The first message has no interval (since there hasn't been a previous message), so don't send it ...
                // Except when a timeout is active, then a 0 interval is allowed (at the moment of the timeout).
                return;
            }
        }
        
        // Send timeout messages (on output 2) anyway
        if (output === 2 || ((!node.minimum || node.minimum <= interval.millisecs) && (!node.maximum || node.maximum >= interval.millisecs))) {                                      
            // Convert the array to the specified format
            switch(node.format) {
                case 'mills': // milliseconds
                    outputValue = interval.millisecs;
                    break;
                case 'human': // humanized
                    outputValue = humanizer(interval.millisecs);
                    break;
                case 'json': // json object
                    outputValue = jsonizer(interval.millisecs);
                    break;
                default:
                    // TODO
            }
            
            // Normally the value will be put in the payload (overwriting the original input message payload value).
            // But the user can explicitely required to put the value in another message field.
            try {
                RED.util.setMessageProperty(msg, node.msgField, outputValue, true);
            } catch(err) {
                node.error("Error setting value in msg." + node.msgField + " : " + err.message);
            }

            // Send the interval message on the specified output port (1 or 2)
            if (output === 1) {
                node.send([msg, null]);
            }
            else {
                node.send([null, msg]);
            }
            
            // As soon as milliseconds have been output, they should be discarded for the next measurement
            interval.millisecs = 0;
        }
    }

    function IntervalLengthNode(config) {
        RED.nodes.createNode(this,config);
        this.format        = config.format;
        this.byTopic       = config.bytopic; 
        this.minimum       = config.minimum;
        this.maximum       = config.maximum;
        this.window        = config.window;
        this.windowTimeout = config.timeout; // the window timeout (true/false).  Don't rename for backward compatibility!!
        this.msgTimeout    = config.msgTimeout; // the msg timeout
        this.startup       = config.startup;
        this.msgField      = config.msgField || 'payload';
        this.repeatTimeout = config.repeatTimeout;
        this.intervals     = new Map();
        
        // Store the startup hrtime, only when 'startup' is being requested by the user
        if (this.startup == true) {
            this.startupHrTime = process.hrtime();
        }
        
        if (this.minimum) {
            // Convert the 'minimum' value to milliseconds (based on the selected time unit)
            switch(config.minimumunit) {
                case "secs":
                    this.minimum *= 1000;
                    break;
                case "mins":
                    this.minimum *= 1000 * 60;
                    break;
                case "hours":
                    this.minimum *= 1000 * 60 * 60;
                    break;            
                default: // "msecs" so no conversion needed
            }
        }
        
        if (this.maximum) {
            // Convert the 'maximum' value to milliseconds (based on the selected time unit)
            switch(config.maximumunit) {
                case "secs":
                    this.maximum *= 1000;
                    break;
                case "mins":
                    this.maximum *= 1000 * 60;
                    break;
                case "hours":
                    this.maximum *= 1000 * 60 * 60;
                    break;            
                default: // "msecs" so no conversion needed
            }  
        }            

        if(this.minimum && this.maximum && this.minimum > this.maximum) {
            this.error("Min > max");        
        }

        if (this.window) {
            // Convert the 'window' value to milliseconds (based on the selected time unit)
            switch(config.windowunit) {
                case "secs":
                    this.window *= 1000;
                    break;
                case "mins":
                    this.window *= 1000 * 60;
                    break;
                case "hours":
                    this.window *= 1000 * 60 * 60;
                    break;            
                default: // "msecs" so no conversion needed
            }
        }
        
        if (this.msgTimeout) {
            // Convert the 'msg timeout' value to milliseconds (based on the selected time unit)
            switch(config.msgTimeoutUnit) {
                case "secs":
                    this.msgTimeout *= 1000;
                    break;
                case "mins":
                    this.msgTimeout *= 1000 * 60;
                    break;
                case "hours":
                    this.msgTimeout *= 1000 * 60 * 60;
                    break;            
                default: // "msecs" so no conversion needed
            }
        }
        
        var node = this;

        node.on("input", function(msg) { 
            var newHrTime = process.hrtime();
            
            // When no topic-based resending, store all topics in the map as a single virtual topic (named 'all_topics')
            var topic = node.byTopic ? msg.topic : "all_topics";
            var interval = node.intervals.get(topic);
            
            if (!interval) {
                interval = { millisecs: 0, hrtime: null, windowTimer: null, timeoutTimer: null };
                node.intervals.set(topic, interval);
            }
            
            if (!interval.hrtime && node.startupHrTime) {
                // When no hrtime is already available (which means this is the first msg that arrives), we will use the 
                // startup time of this node (if 'startup' has been requested by the user).
                interval.hrtime = node.startupHrTime;
            }
            
            if (interval.hrtime) {
                 // Calculate the time difference between the previous hrTime and now
                var difference = process.hrtime(interval.hrtime);
                
                // The hrtime returns array: the first element contains the number of complete seconds that have elapsed, 
                // and the second element contains the REMAINING number of nanoseconds.
                // (see http://tinyexplosions.com/development/2016/03/21/node-timing.html)
                
                // Convert the array to milliseconds
                var milliSeconds = (difference[0] * 1e9 + difference[1]) / 1e6;
                
                if (interval.windowTimer) {
                    // When a window timer is already running (for the specified topic), accumulate the interval to the others
                    interval.millisecs += milliSeconds;
                } 
                else {
                    interval.millisecs = milliSeconds;
                    
                    // send the (unaccumulated) interval length 
                    sendMsg(node, msg, interval, 1);
                }
            }   
                        
            if ( node.window > 0 && !interval.windowTimer) { 
                // Start a new window timer, for the specified time window.
                // The window timer id will be stored, so it can be found when a new msg arrives at the input.
                interval.windowTimer = setInterval(function() {        
                    // At the end of the window, we will send the accumulated interval. 
                    // When nothing received during the window (sum = 0), nothing will be send unless a window timeout is specified. 
                    if (interval.millisecs > 0 || node.windowTimeout == true) { 
                        sendMsg(node, msg, interval, 1);           
                    } 

                    clearInterval(interval.windowTimer);
                    interval.windowTimer = null;                    
                }, node.window); 
            }
            
            if ( node.msgTimeout > 0) {
                if (interval.timeoutTimer) { 
                    // Start the timeout counting all over again, when a new message arrives ...
                    clearInterval(interval.timeoutTimer);
                }
                            
                // Start a new msg timeout timer, for the new message.
                // The msg timeout timer id will be stored, so it can be found when a new msg arrives at the input.
                interval.timeoutTimer = setInterval(function() {    
                    var timeoutMsg = {};
                    sendMsg(node, msg, interval, 2);  
                    
                    // Don't repeat the timout, except when specified explicitely
                    if (!node.repeatTimeout) {
                        clearInterval(interval.timeoutTimer);
                        interval.timeoutTimer = null;  
                    }                        
                }, node.msgTimeout); 
            }
            
            // Store the time when this message has arrived 
            interval.hrtime = newHrTime;
        });
        
        node.on("close", function() {            
            for(var interval of node.intervals.values()) {
                if (interval.windowTimer) {
                    clearInterval(interval.windowTimer);
                }
                
                if (interval.timeoutTimer) {
                    clearInterval(interval.timeoutTimer);
                }                
            }
            
            node.intervals.clear();
            node.status({});
        });
    }

    RED.nodes.registerType("interval-length",IntervalLengthNode);
}
