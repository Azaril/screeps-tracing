Set up the profiler similar to screeps-profiler.
Wrap your tick function in Profiler.Tick(() =>)
Use "Game.profiler.report()" to dump a json trace.
Copy/paste json trace in to a local file (trace.json as an example).
Open chrome to chrome://tracing.
Click load trace and select your trace file.


Advanced options:

Dump a trace when a frame runs longer than a ratio of your limit.
Game.profiler.longTickRatio = 0.9

Dump a trace when the running frame hits this percentage of tick limit. (Allows tracing on frames that get interrupted up to a certain point.)
Game.profiler.panicTickRatio = 0.9

Add custom scopes to tracing using:

Scope.(name, func);

Example for wrapping a creeps tick:
Scope.name("Creep - " + creep.name, () => creep.doStuff());
