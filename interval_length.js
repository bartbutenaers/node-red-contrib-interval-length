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
    var settings = RED.settings;  

    function IntervalLengthNode(config) {
        RED.nodes.createNode(this,config);
        this.format = config.format;
        this.byTopic = config.bytopic; 
        this.intervals = new Map();
        
        var node = this;

        node.on("input", function(msg) { 
            var newHrTime = process.hrtime();
            
            // When no topic-based resending, store all topics in the map as a single virtual topic (named 'all_topics')
            var topic = node.byTopic ? msg.topic : "all_topics";
            var previousHrTime = node.intervals.get(topic);
        
            if (previousHrTime) {
                // Calculate the time difference between the previousHrTime and now
                var difference = process.hrtime(previousHrTime);
                
                // The hrtime returns array: the first element contains the number of complete seconds that have elapsed, 
                // and the second element contains the REMAINING number of nanoseconds.
                // (see http://tinyexplosions.com/development/2016/03/21/node-timing.html)
                
                // Convert the array to the specified format
                switch(node.format) {
                    case 'mills': // milliseconds
                        msg.payload = (difference[0] * 1e9 + difference[1]) / 1e6;
                        break;
                    default:
                        // TODO
                }

                node.send(msg);
            }
            
            node.intervals.set(topic, newHrTime);
        });
        
        node.on("close", function() {
            node.statistics.clear();
            node.status({});
        });
    }

    RED.nodes.registerType("interval-length",IntervalLengthNode);
}