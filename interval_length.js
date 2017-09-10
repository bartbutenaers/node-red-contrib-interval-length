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
    
    function sendMsg(node, msg, interval) {
        if (interval.millisecs == 0 && node.timeout == false) {
            // The first message has no interval (since there hasn't been a previous message), so don't send it ...
            // Except when a timeout is active, then a 0 interval is allowed (at the moment of the timeout).
            return;
        }
        
        if ((!node.minimum || node.minimum <= interval.millisecs) && (!node.maximum || node.maximum >= interval.millisecs)) {                                      
            // Convert the array to the specified format
            switch(node.format) {
                case 'mills': // milliseconds
                    msg.payload = interval.millisecs;
                    break;
                case 'human': // humanized
                    msg.payload = humanizer(interval.millisecs);
                    break;
                case 'json': // json object
                    msg.payload = jsonizer(interval.millisecs);
                    break;
                default:
                    // TODO
            }

            node.send(msg);
            
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
        this.timeout       = config.timeout;
        this.startup       = config.startup;
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
        
        var node = this;

        node.on("input", function(msg) { 
            var newHrTime = process.hrtime();
            
            // When no topic-based resending, store all topics in the map as a single virtual topic (named 'all_topics')
            var topic = node.byTopic ? msg.topic : "all_topics";
            var interval = node.intervals.get(topic);
            
            if (!interval) {
                interval = { millisecs: 0, hrtime: null, timer: null };
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
                
                if (interval.timer) {
                    // When a window timer is already running (for the specified topic), accumulate the interval to the others
                    interval.millisecs += milliSeconds;
                } 
                else {
                    interval.millisecs = milliSeconds;
                    
                    // send the (unaccumulated) interval length 
                    sendMsg(node, msg, interval);
                }
            }   
                        
            if ( node.window > 0 && !interval.timer) { 
                // Start a new timer, for the specified time window.
                // The timer id will be stored, so it can be found when a new msg arrives at the input.
                interval.timer = setInterval(function() {        
                    // At the end of the window, we will send the accumulated interval. 
                    // When nothing received during the window (sum = 0), nothing will be send unless a timeout is specified. 
                    if (interval.millisecs > 0 || node.timeout == true) { 
                        sendMsg(node, msg, interval);           
                    } 

                    clearInterval(interval.timer);
                    interval.timer = null;                    
                }, node.window); 
            }
            
            // Store the time when this message has arrived 
            interval.hrtime = newHrTime;
        });
        
        node.on("close", function() {
            node.intervals.clear();
            node.status({});
            
            for(var interval of node.intervals.values()) {
                clearInterval(interval.timer);
            }
        });
    }

    RED.nodes.registerType("interval-length",IntervalLengthNode);
}
