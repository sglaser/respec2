/* ReSpec 3.2.92 - Robin Berjon, http://berjon.com/ (@robinberjon) */
/* Documentation: http://w3.org/respec/. */
/* See original source for licenses: https://github.com/w3c/respec */
/* See also PCISIG source: https://github.com/sglaser/respec */
respecVersion = '3.2.92';
respecVersionPCISIG = '0.0.1';
/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.22 Copyright (c) 2010-2015, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.22',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                each(globalDefQueue, function(queueItem) {
                    var id = queueItem[0];
                    if (typeof id === 'string') {
                        context.defQueueMap[id] = true;
                    }
                    defQueue.push(queueItem);
                });
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    // Only fetch if not already in the defQueue.
                    if (!hasProp(context.defQueueMap, id)) {
                        this.fetch();
                    }
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            try {
                                exports = context.execCb(id, factory, depExports, exports);
                            } catch (e) {
                                err = e;
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                // If there is an error listener, favor passing
                                // to that instead of throwing an error. However,
                                // only do it for define()'d  modules. require
                                // errbacks should not be called for failures in
                                // their callbacks (#699). However if a global
                                // onError is set, use that.
                                if ((this.events.error && this.map.isDefine) ||
                                    req.onError !== defaultOnError) {
                                    err.requireMap = this.map;
                                    err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                    err.requireType = this.map.isDefine ? 'define' : 'require';
                                    return onError((this.error = err));
                                } else if (typeof console !== 'undefined' &&
                                           console.error) {
                                    // Log the error for debugging. If promises could be
                                    // used, this would be different, but making do.
                                    console.error(err);
                                } else {
                                    // Do not want to completely lose the error. While this
                                    // will mess up processing and lead to similar results
                                    // as bug 1440, it at least surfaces the error.
                                    req.onError(err);
                                }
                            }
                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                var resLoadMaps = [];
                                each(this.depMaps, function (depMap) {
                                    resLoadMaps.push(depMap.normalizedMap || depMap);
                                });
                                req.onResourceLoad(context, this.map, resLoadMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.map.normalizedMap = normalizedMap;
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            if (this.undefed) {
                                return;
                            }
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        } else if (this.events.error) {
                            // No direct errback on this module, but something
                            // else is listening for errors, so be sure to
                            // propagate the error correctly.
                            on(depMap, 'error', bind(this, function(err) {
                                this.emit('error', err);
                            }));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' +
                        args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
            context.defQueueMap = {};
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            defQueueMap: {},
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? {name: pkgObj} : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id, null, true);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        mod.undefed = true;
                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if (args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });
                        delete context.defQueueMap[id];

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }
                context.defQueueMap = {};

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    var parents = [];
                    eachProp(registry, function(value, key) {
                        if (key.indexOf('_@r') !== 0) {
                            each(value.depMaps, function(depMap) {
                                if (depMap.id === data.id) {
                                    parents.push(key);
                                }
                                return true;
                            });
                        }
                    });
                    return onError(makeError('scripterror', 'Script error for "' + data.id +
                                             (parents.length ?
                                             '", needed by: ' + parents.join(', ') :
                                             '"'), evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);
            if (config.onNodeCreated) {
                config.onNodeCreated(node, config, moduleName, url);
            }

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation is that a build has been done so
                //that only one script needs to be loaded anyway. This may need
                //to be reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        if (context) {
            context.defQueue.push([name, deps, callback]);
            context.defQueueMap[name] = true;
        } else {
            globalDefQueue.push([name, deps, callback]);
        }
    };

    define.amd = {
        jQuery: true
    };

    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("requireLib", function(){});

/**
 * @license RequireJS domReady 2.0.1 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/domReady for details
 */
/*jslint */
/*global require: false, define: false, requirejs: false,
  window: false, clearInterval: false, document: false,
  self: false, setInterval: false */


define('domReady',[],function () {
    'use strict';

    var isTop, testDiv, scrollIntervalId,
        isBrowser = typeof window !== "undefined" && window.document,
        isPageLoaded = !isBrowser,
        doc = isBrowser ? document : null,
        readyCalls = [];

    function runCallbacks(callbacks) {
        var i;
        for (i = 0; i < callbacks.length; i += 1) {
            callbacks[i](doc);
        }
    }

    function callReady() {
        var callbacks = readyCalls;

        if (isPageLoaded) {
            //Call the DOM ready callbacks
            if (callbacks.length) {
                readyCalls = [];
                runCallbacks(callbacks);
            }
        }
    }

    /**
     * Sets the page as loaded.
     */
    function pageLoaded() {
        if (!isPageLoaded) {
            isPageLoaded = true;
            if (scrollIntervalId) {
                clearInterval(scrollIntervalId);
            }

            callReady();
        }
    }

    if (isBrowser) {
        if (document.addEventListener) {
            //Standards. Hooray! Assumption here that if standards based,
            //it knows about DOMContentLoaded.
            document.addEventListener("DOMContentLoaded", pageLoaded, false);
            window.addEventListener("load", pageLoaded, false);
        } else if (window.attachEvent) {
            window.attachEvent("onload", pageLoaded);

            testDiv = document.createElement('div');
            try {
                isTop = window.frameElement === null;
            } catch (e) {}

            //DOMContentLoaded approximation that uses a doScroll, as found by
            //Diego Perini: http://javascript.nwbox.com/IEContentLoaded/,
            //but modified by other contributors, including jdalton
            if (testDiv.doScroll && isTop && window.external) {
                scrollIntervalId = setInterval(function () {
                    try {
                        testDiv.doScroll();
                        pageLoaded();
                    } catch (e) {}
                }, 30);
            }
        }

        //Check if document already complete, and if so, just trigger page load
        //listeners. Latest webkit browsers also use "interactive", and
        //will fire the onDOMContentLoaded before "interactive" but not after
        //entering "interactive" or "complete". More details:
        //http://dev.w3.org/html5/spec/the-end.html#the-end
        //http://stackoverflow.com/questions/3665561/document-readystate-of-interactive-vs-ondomcontentloaded
        //Hmm, this is more complicated on further use, see "firing too early"
        //bug: https://github.com/requirejs/domReady/issues/1
        //so removing the || document.readyState === "interactive" test.
        //There is still a window.onload binding that should get fired if
        //DOMContentLoaded is missed.
        if (document.readyState === "complete") {
            pageLoaded();
        }
    }

    /** START OF PUBLIC API **/

    /**
     * Registers a callback for DOM ready. If DOM is already ready, the
     * callback is called immediately.
     * @param {Function} callback
     */
    function domReady(callback) {
        if (isPageLoaded) {
            callback(doc);
        } else {
            readyCalls.push(callback);
        }
        return domReady;
    }

    domReady.version = '2.0.1';

    /**
     * Loader Plugin API method
     */
    domReady.load = function (name, req, onLoad, config) {
        if (config.isBuild) {
            onLoad(null);
        } else {
            domReady(onLoad);
        }
    };

    /** END OF PUBLIC API **/

    return domReady;
});

/*! jQuery v2.1.4 | (c) 2005, 2015 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l=a.document,m="2.1.4",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return n.each(this,a,b)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){return!n.isArray(a)&&a-parseFloat(a)+1>=0},isPlainObject:function(a){return"object"!==n.type(a)||a.nodeType||n.isWindow(a)?!1:a.constructor&&!j.call(a.constructor.prototype,"isPrototypeOf")?!1:!0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=l.createElement("script"),b.text=a,l.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=s(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:g.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=s(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(e=d.call(arguments,2),f=function(){return a.apply(b||this,e.concat(d.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:k}),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function s(a){var b="length"in a&&a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ha(),z=ha(),A=ha(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N=M.replace("w","w#"),O="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+N+"))|)"+L+"*\\]",P=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+O+")*)|.*)\\)|)",Q=new RegExp(L+"+","g"),R=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),S=new RegExp("^"+L+"*,"+L+"*"),T=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),U=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),V=new RegExp(P),W=new RegExp("^"+N+"$"),X={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M.replace("w","w*")+")"),ATTR:new RegExp("^"+O),PSEUDO:new RegExp("^"+P),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,aa=/[+~]/,ba=/'|\\/g,ca=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),da=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},ea=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(fa){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function ga(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],k=b.nodeType,"string"!=typeof a||!a||1!==k&&9!==k&&11!==k)return d;if(!e&&p){if(11!==k&&(f=_.exec(a)))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return H.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName)return H.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=1!==k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(ba,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+ra(o[l]);w=aa.test(a)&&pa(b.parentNode)||b,x=o.join(",")}if(x)try{return H.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function ha(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ia(a){return a[u]=!0,a}function ja(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ka(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function la(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function na(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function oa(a){return ia(function(b){return b=+b,ia(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function pa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=ga.support={},f=ga.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=ga.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=g.documentElement,e=g.defaultView,e&&e!==e.top&&(e.addEventListener?e.addEventListener("unload",ea,!1):e.attachEvent&&e.attachEvent("onunload",ea)),p=!f(g),c.attributes=ja(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ja(function(a){return a.appendChild(g.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(g.getElementsByClassName),c.getById=ja(function(a){return o.appendChild(a).id=u,!g.getElementsByName||!g.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(g.querySelectorAll))&&(ja(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\f]' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ja(function(a){var b=g.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ja(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",P)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===g||a.ownerDocument===v&&t(v,a)?-1:b===g||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,h=[a],i=[b];if(!e||!f)return a===g?-1:b===g?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return la(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?la(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},g):n},ga.matches=function(a,b){return ga(a,null,null,b)},ga.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return ga(b,n,null,[a]).length>0},ga.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},ga.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},ga.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},ga.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=ga.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=ga.selectors={cacheLength:50,createPseudo:ia,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(ca,da),a[3]=(a[3]||a[4]||a[5]||"").replace(ca,da),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||ga.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&ga.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(ca,da).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=ga.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(Q," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||ga.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ia(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ia(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?ia(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ia(function(a){return function(b){return ga(a,b).length>0}}),contains:ia(function(a){return a=a.replace(ca,da),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ia(function(a){return W.test(a||"")||ga.error("unsupported lang: "+a),a=a.replace(ca,da).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:oa(function(){return[0]}),last:oa(function(a,b){return[b-1]}),eq:oa(function(a,b,c){return[0>c?c+b:c]}),even:oa(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:oa(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:oa(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:oa(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=ma(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=na(b);function qa(){}qa.prototype=d.filters=d.pseudos,d.setFilters=new qa,g=ga.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?ga.error(a):z(a,i).slice(0)};function ra(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function sa(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function ta(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ua(a,b,c){for(var d=0,e=b.length;e>d;d++)ga(a,b[d],c);return c}function va(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function wa(a,b,c,d,e,f){return d&&!d[u]&&(d=wa(d)),e&&!e[u]&&(e=wa(e,f)),ia(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ua(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:va(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=va(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=va(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function xa(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=sa(function(a){return a===b},h,!0),l=sa(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[sa(ta(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return wa(i>1&&ta(m),i>1&&ra(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&xa(a.slice(i,e)),f>e&&xa(a=a.slice(e)),f>e&&ra(a))}m.push(c)}return ta(m)}function ya(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=F.call(i));s=va(s)}H.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&ga.uniqueSort(i)}return k&&(w=v,j=t),r};return c?ia(f):f}return h=ga.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=xa(b[c]),f[u]?d.push(f):e.push(f);f=A(a,ya(e,d)),f.selector=a}return f},i=ga.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(ca,da),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(ca,da),aa.test(j[0].type)&&pa(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&ra(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,aa.test(a)&&pa(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ja(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ja(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ka("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ja(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ka("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ja(function(a){return null==a.getAttribute("disabled")})||ka(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),ga}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=n.expr.match.needsContext,v=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,w=/^.[^:#\[\.,]*$/;function x(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(w.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return g.call(b,a)>=0!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(x(this,a||[],!1))},not:function(a){return this.pushStack(x(this,a||[],!0))},is:function(a){return!!x(this,"string"==typeof a&&u.test(a)?n(a):a||[],!1).length}});var y,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=n.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||y).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:l,!0)),v.test(c[1])&&n.isPlainObject(b))for(c in b)n.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}return d=l.getElementById(c[2]),d&&d.parentNode&&(this.length=1,this[0]=d),this.context=l,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof y.ready?y.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};A.prototype=n.fn,y=n(l);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};n.extend({dir:function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=u.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.unique(f):f)},index:function(a){return a?"string"==typeof a?g.call(n(a),this[0]):g.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.unique(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(C[a]||n.unique(e),B.test(a)&&e.reverse()),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return n.each(a.match(E)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):n.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(b=a.memory&&l,c=!0,g=e||0,e=0,f=h.length,d=!0;h&&f>g;g++)if(h[g].apply(l[0],l[1])===!1&&a.stopOnFalse){b=!1;break}d=!1,h&&(i?i.length&&j(i.shift()):b?h=[]:k.disable())},k={add:function(){if(h){var c=h.length;!function g(b){n.each(b,function(b,c){var d=n.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&g(c)})}(arguments),d?f=h.length:b&&(e=c,j(b))}return this},remove:function(){return h&&n.each(arguments,function(a,b){var c;while((c=n.inArray(b,h,c))>-1)h.splice(c,1),d&&(f>=c&&f--,g>=c&&g--)}),this},has:function(a){return a?n.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],f=0,this},disable:function(){return h=i=b=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,b||k.disable(),this},locked:function(){return!i},fireWith:function(a,b){return!h||c&&!i||(b=b||[],b=[a,b.slice?b.slice():b],d?i.push(b):j(b)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!c}};return k},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&n.isFunction(a.promise)?e:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(H.resolveWith(l,[n]),n.fn.triggerHandler&&(n(l).triggerHandler("ready"),n(l).off("ready"))))}});function I(){l.removeEventListener("DOMContentLoaded",I,!1),a.removeEventListener("load",I,!1),n.ready()}n.ready.promise=function(b){return H||(H=n.Deferred(),"complete"===l.readyState?setTimeout(n.ready):(l.addEventListener("DOMContentLoaded",I,!1),a.addEventListener("load",I,!1))),H.promise(b)},n.ready.promise();var J=n.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)n.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f};n.acceptData=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function K(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=n.expando+K.uid++}K.uid=1,K.accepts=n.acceptData,K.prototype={key:function(a){if(!K.accepts(a))return 0;var b={},c=a[this.expando];if(!c){c=K.uid++;try{b[this.expando]={value:c},Object.defineProperties(a,b)}catch(d){b[this.expando]=c,n.extend(a,b)}}return this.cache[c]||(this.cache[c]={}),c},set:function(a,b,c){var d,e=this.key(a),f=this.cache[e];if("string"==typeof b)f[b]=c;else if(n.isEmptyObject(f))n.extend(this.cache[e],b);else for(d in b)f[d]=b[d];return f},get:function(a,b){var c=this.cache[this.key(a)];return void 0===b?c:c[b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=this.key(a),g=this.cache[f];if(void 0===b)this.cache[f]={};else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in g?d=[b,e]:(d=e,d=d in g?[d]:d.match(E)||[])),c=d.length;while(c--)delete g[d[c]]}},hasData:function(a){return!n.isEmptyObject(this.cache[a[this.expando]]||{})},discard:function(a){a[this.expando]&&delete this.cache[a[this.expando]]}};var L=new K,M=new K,N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(O,"-$1").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}M.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return M.hasData(a)||L.hasData(a)},data:function(a,b,c){
return M.access(a,b,c)},removeData:function(a,b){M.remove(a,b)},_data:function(a,b,c){return L.access(a,b,c)},_removeData:function(a,b){L.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=M.get(f),1===f.nodeType&&!L.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));L.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){M.set(this,a)}):J(this,function(b){var c,d=n.camelCase(a);if(f&&void 0===b){if(c=M.get(f,a),void 0!==c)return c;if(c=M.get(f,d),void 0!==c)return c;if(c=P(f,d,void 0),void 0!==c)return c}else this.each(function(){var c=M.get(this,d);M.set(this,d,b),-1!==a.indexOf("-")&&void 0!==c&&M.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){M.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=L.get(a,b),c&&(!d||n.isArray(c)?d=L.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return L.get(a,c)||L.access(a,c,{empty:n.Callbacks("once memory").add(function(){L.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=L.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var Q=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,R=["Top","Right","Bottom","Left"],S=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)},T=/^(?:checkbox|radio)$/i;!function(){var a=l.createDocumentFragment(),b=a.appendChild(l.createElement("div")),c=l.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var U="undefined";k.focusinBubbles="onfocusin"in a;var V=/^key/,W=/^(?:mouse|pointer|contextmenu)|click/,X=/^(?:focusinfocus|focusoutblur)$/,Y=/^([^.]*)(?:\.(.+)|)$/;function Z(){return!0}function $(){return!1}function _(){try{return l.activeElement}catch(a){}}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return typeof n!==U&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(E)||[""],j=b.length;while(j--)h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g,!1)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.hasData(a)&&L.get(a);if(r&&(i=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&(delete r.handle,L.remove(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,m,o,p=[d||l],q=j.call(b,"type")?b.type:b,r=j.call(b,"namespace")?b.namespace.split("."):[];if(g=h=d=d||l,3!==d.nodeType&&8!==d.nodeType&&!X.test(q+n.event.triggered)&&(q.indexOf(".")>=0&&(r=q.split("."),q=r.shift(),r.sort()),k=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=r.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},e||!o.trigger||o.trigger.apply(d,c)!==!1)){if(!e&&!o.noBubble&&!n.isWindow(d)){for(i=o.delegateType||q,X.test(i+q)||(g=g.parentNode);g;g=g.parentNode)p.push(g),h=g;h===(d.ownerDocument||l)&&p.push(h.defaultView||h.parentWindow||a)}f=0;while((g=p[f++])&&!b.isPropagationStopped())b.type=f>1?i:o.bindType||q,m=(L.get(g,"events")||{})[b.type]&&L.get(g,"handle"),m&&m.apply(g,c),m=k&&g[k],m&&m.apply&&n.acceptData(g)&&(b.result=m.apply(g,c),b.result===!1&&b.preventDefault());return b.type=q,e||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!n.acceptData(d)||k&&n.isFunction(d[q])&&!n.isWindow(d)&&(h=d[k],h&&(d[k]=null),n.event.triggered=q,d[q](),n.event.triggered=void 0,h&&(d[k]=h)),b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(L.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(g.namespace))&&(a.handleObj=g,a.data=g.data,e=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(a.result=e)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!==this;i=i.parentNode||this)if(i.disabled!==!0||"click"!==a.type){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>=0:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||l,d=c.documentElement,e=c.body,a.pageX=b.clientX+(d&&d.scrollLeft||e&&e.scrollLeft||0)-(d&&d.clientLeft||e&&e.clientLeft||0),a.pageY=b.clientY+(d&&d.scrollTop||e&&e.scrollTop||0)-(d&&d.clientTop||e&&e.clientTop||0)),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=W.test(e)?this.mouseHooks:V.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new n.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=l),3===a.target.nodeType&&(a.target=a.target.parentNode),g.filter?g.filter(a,f):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==_()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===_()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?Z:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=Z,a&&a.preventDefault&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=Z,a&&a.stopPropagation&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=Z,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=L.access(d,b);e||d.addEventListener(a,c,!0),L.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=L.access(d,b)-1;e?L.access(d,b,e):(d.removeEventListener(a,c,!0),L.remove(d,b))}}}),n.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(g in a)this.on(g,b,c,a[g],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=$;else if(!d)return this;return 1===e&&(f=d,d=function(a){return n().off(a),f.apply(this,arguments)},d.guid=f.guid||(f.guid=n.guid++)),this.each(function(){n.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=$),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var aa=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,ba=/<([\w:]+)/,ca=/<|&#?\w+;/,da=/<(?:script|style|link)/i,ea=/checked\s*(?:[^=]|=\s*.checked.)/i,fa=/^$|\/(?:java|ecma)script/i,ga=/^true\/(.*)/,ha=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ia={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ia.optgroup=ia.option,ia.tbody=ia.tfoot=ia.colgroup=ia.caption=ia.thead,ia.th=ia.td;function ja(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function ka(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function la(a){var b=ga.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function ma(a,b){for(var c=0,d=a.length;d>c;c++)L.set(a[c],"globalEval",!b||L.get(b[c],"globalEval"))}function na(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(L.hasData(a)&&(f=L.access(a),g=L.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}M.hasData(a)&&(h=M.access(a),i=n.extend({},h),M.set(b,i))}}function oa(a,b){var c=a.getElementsByTagName?a.getElementsByTagName(b||"*"):a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function pa(a,b){var c=b.nodeName.toLowerCase();"input"===c&&T.test(a.type)?b.checked=a.checked:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}n.extend({clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=oa(h),f=oa(a),d=0,e=f.length;e>d;d++)pa(f[d],g[d]);if(b)if(c)for(f=f||oa(a),g=g||oa(h),d=0,e=f.length;e>d;d++)na(f[d],g[d]);else na(a,h);return g=oa(h,"script"),g.length>0&&ma(g,!i&&oa(a,"script")),h},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,k=b.createDocumentFragment(),l=[],m=0,o=a.length;o>m;m++)if(e=a[m],e||0===e)if("object"===n.type(e))n.merge(l,e.nodeType?[e]:e);else if(ca.test(e)){f=f||k.appendChild(b.createElement("div")),g=(ba.exec(e)||["",""])[1].toLowerCase(),h=ia[g]||ia._default,f.innerHTML=h[1]+e.replace(aa,"<$1></$2>")+h[2],j=h[0];while(j--)f=f.lastChild;n.merge(l,f.childNodes),f=k.firstChild,f.textContent=""}else l.push(b.createTextNode(e));k.textContent="",m=0;while(e=l[m++])if((!d||-1===n.inArray(e,d))&&(i=n.contains(e.ownerDocument,e),f=oa(k.appendChild(e),"script"),i&&ma(f),c)){j=0;while(e=f[j++])fa.test(e.type||"")&&c.push(e)}return k},cleanData:function(a){for(var b,c,d,e,f=n.event.special,g=0;void 0!==(c=a[g]);g++){if(n.acceptData(c)&&(e=c[L.expando],e&&(b=L.cache[e]))){if(b.events)for(d in b.events)f[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);L.cache[e]&&delete L.cache[e]}delete M.cache[c[M.expando]]}}}),n.fn.extend({text:function(a){return J(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&(this.textContent=a)})},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=ja(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=ja(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?n.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||n.cleanData(oa(c)),c.parentNode&&(b&&n.contains(c.ownerDocument,c)&&ma(oa(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(oa(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return J(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!da.test(a)&&!ia[(ba.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(aa,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(oa(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,n.cleanData(oa(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,m=this,o=l-1,p=a[0],q=n.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&ea.test(p))return this.each(function(c){var d=m.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(c=n.buildFragment(a,this[0].ownerDocument,!1,this),d=c.firstChild,1===c.childNodes.length&&(c=d),d)){for(f=n.map(oa(c,"script"),ka),g=f.length;l>j;j++)h=c,j!==o&&(h=n.clone(h,!0,!0),g&&n.merge(f,oa(h,"script"))),b.call(this[j],h,j);if(g)for(i=f[f.length-1].ownerDocument,n.map(f,la),j=0;g>j;j++)h=f[j],fa.test(h.type||"")&&!L.access(h,"globalEval")&&n.contains(i,h)&&(h.src?n._evalUrl&&n._evalUrl(h.src):n.globalEval(h.textContent.replace(ha,"")))}return this}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),g=e.length-1,h=0;g>=h;h++)c=h===g?this:this.clone(!0),n(e[h])[b](c),f.apply(d,c.get());return this.pushStack(d)}});var qa,ra={};function sa(b,c){var d,e=n(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:n.css(e[0],"display");return e.detach(),f}function ta(a){var b=l,c=ra[a];return c||(c=sa(a,b),"none"!==c&&c||(qa=(qa||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=qa[0].contentDocument,b.write(),b.close(),c=sa(a,b),qa.detach()),ra[a]=c),c}var ua=/^margin/,va=new RegExp("^("+Q+")(?!px)[a-z%]+$","i"),wa=function(b){return b.ownerDocument.defaultView.opener?b.ownerDocument.defaultView.getComputedStyle(b,null):a.getComputedStyle(b,null)};function xa(a,b,c){var d,e,f,g,h=a.style;return c=c||wa(a),c&&(g=c.getPropertyValue(b)||c[b]),c&&(""!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),va.test(g)&&ua.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function ya(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d=l.documentElement,e=l.createElement("div"),f=l.createElement("div");if(f.style){f.style.backgroundClip="content-box",f.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===f.style.backgroundClip,e.style.cssText="border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute",e.appendChild(f);function g(){f.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",f.innerHTML="",d.appendChild(e);var g=a.getComputedStyle(f,null);b="1%"!==g.top,c="4px"===g.width,d.removeChild(e)}a.getComputedStyle&&n.extend(k,{pixelPosition:function(){return g(),b},boxSizingReliable:function(){return null==c&&g(),c},reliableMarginRight:function(){var b,c=f.appendChild(l.createElement("div"));return c.style.cssText=f.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",f.style.width="1px",d.appendChild(e),b=!parseFloat(a.getComputedStyle(c,null).marginRight),d.removeChild(e),f.removeChild(c),b}})}}(),n.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var za=/^(none|table(?!-c[ea]).+)/,Aa=new RegExp("^("+Q+")(.*)$","i"),Ba=new RegExp("^([+-])=("+Q+")","i"),Ca={position:"absolute",visibility:"hidden",display:"block"},Da={letterSpacing:"0",fontWeight:"400"},Ea=["Webkit","O","Moz","ms"];function Fa(a,b){if(b in a)return b;var c=b[0].toUpperCase()+b.slice(1),d=b,e=Ea.length;while(e--)if(b=Ea[e]+c,b in a)return b;return d}function Ga(a,b,c){var d=Aa.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Ha(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+R[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+R[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+R[f]+"Width",!0,e))):(g+=n.css(a,"padding"+R[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+R[f]+"Width",!0,e)));return g}function Ia(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=wa(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=xa(a,b,f),(0>e||null==e)&&(e=a.style[b]),va.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Ha(a,b,c||(g?"border":"content"),d,f)+"px"}function Ja(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=L.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&S(d)&&(f[g]=L.access(d,"olddisplay",ta(d.nodeName)))):(e=S(d),"none"===c&&e||L.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=xa(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Fa(i,h)),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=Ba.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(n.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||n.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Fa(a.style,h)),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=xa(a,b,d)),"normal"===e&&b in Da&&(e=Da[b]),""===c||c?(f=parseFloat(e),c===!0||n.isNumeric(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?za.test(n.css(a,"display"))&&0===a.offsetWidth?n.swap(a,Ca,function(){return Ia(a,b,d)}):Ia(a,b,d):void 0},set:function(a,c,d){var e=d&&wa(a);return Ga(a,c,d?Ha(a,b,d,"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),n.cssHooks.marginRight=ya(k.reliableMarginRight,function(a,b){return b?n.swap(a,{display:"inline-block"},xa,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+R[d]+b]=f[d]||f[d-2]||f[0];return e}},ua.test(a)||(n.cssHooks[a+b].set=Ga)}),n.fn.extend({css:function(a,b){return J(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=wa(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Ja(this,!0)},hide:function(){return Ja(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){S(this)?n(this).show():n(this).hide()})}});function Ka(a,b,c,d,e){return new Ka.prototype.init(a,b,c,d,e)}n.Tween=Ka,Ka.prototype={constructor:Ka,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Ka.propHooks[this.prop];return a&&a.get?a.get(this):Ka.propHooks._default.get(this)},run:function(a){var b,c=Ka.propHooks[this.prop];return this.options.duration?this.pos=b=n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Ka.propHooks._default.set(this),this}},Ka.prototype.init.prototype=Ka.prototype,Ka.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Ka.propHooks.scrollTop=Ka.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.fx=Ka.prototype.init,n.fx.step={};var La,Ma,Na=/^(?:toggle|show|hide)$/,Oa=new RegExp("^(?:([+-])=|)("+Q+")([a-z%]*)$","i"),Pa=/queueHooks$/,Qa=[Va],Ra={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=Oa.exec(b),f=e&&e[3]||(n.cssNumber[a]?"":"px"),g=(n.cssNumber[a]||"px"!==f&&+d)&&Oa.exec(n.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,n.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function Sa(){return setTimeout(function(){La=void 0}),La=n.now()}function Ta(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=R[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ua(a,b,c){for(var d,e=(Ra[b]||[]).concat(Ra["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Va(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&S(a),q=L.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?L.get(a,"olddisplay")||ta(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Na.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?ta(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=L.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;L.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ua(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function Wa(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Xa(a,b,c){var d,e,f=0,g=Qa.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=La||Sa(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:La||Sa(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Wa(k,j.opts.specialEasing);g>f;f++)if(d=Qa[f].call(j,a,k,j.opts))return d;return n.map(k,Ua,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(Xa,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Ra[c]=Ra[c]||[],Ra[c].unshift(b)},prefilter:function(a,b){b?Qa.unshift(a):Qa.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(S).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Xa(this,n.extend({},a),f);(e||L.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=L.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Pa.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=L.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Ta(b,!0),a,d,e)}}),n.each({slideDown:Ta("show"),slideUp:Ta("hide"),slideToggle:Ta("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(La=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),La=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Ma||(Ma=setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){clearInterval(Ma),Ma=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a=l.createElement("input"),b=l.createElement("select"),c=b.appendChild(l.createElement("option"));a.type="checkbox",k.checkOn=""!==a.value,k.optSelected=c.selected,b.disabled=!0,k.optDisabled=!c.disabled,a=l.createElement("input"),a.value="t",a.type="radio",k.radioValue="t"===a.value}();var Ya,Za,$a=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return J(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===U?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),d=n.attrHooks[b]||(n.expr.match.bool.test(b)?Za:Ya)),
void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=n.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void n.removeAttr(a,b))},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),Za={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=$a[b]||n.find.attr;$a[b]=function(a,b,d){var e,f;return d||(f=$a[b],$a[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,$a[b]=f),e}});var _a=/^(?:input|select|textarea|button)$/i;n.fn.extend({prop:function(a,b){return J(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!n.isXMLDoc(a),f&&(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){return a.hasAttribute("tabindex")||_a.test(a.nodeName)||a.href?a.tabIndex:-1}}}}),k.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var ab=/[\t\r\n\f]/g;n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h="string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ab," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=n.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0===arguments.length||"string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ab," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?n.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(n.isFunction(a)?function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=n(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===U||"boolean"===c)&&(this.className&&L.set(this,"__className__",this.className),this.className=this.className||a===!1?"":L.get(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ab," ").indexOf(b)>=0)return!0;return!1}});var bb=/\r/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(bb,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(d.value,f)>=0)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}},k.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var cb=n.now(),db=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(a){var b,c;if(!a||"string"!=typeof a)return null;try{c=new DOMParser,b=c.parseFromString(a,"text/xml")}catch(d){b=void 0}return(!b||b.getElementsByTagName("parsererror").length)&&n.error("Invalid XML: "+a),b};var eb=/#.*$/,fb=/([?&])_=[^&]*/,gb=/^(.*?):[ \t]*([^\r\n]*)$/gm,hb=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,ib=/^(?:GET|HEAD)$/,jb=/^\/\//,kb=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,lb={},mb={},nb="*/".concat("*"),ob=a.location.href,pb=kb.exec(ob.toLowerCase())||[];function qb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function rb(a,b,c,d){var e={},f=a===mb;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function sb(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function tb(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function ub(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:ob,type:"GET",isLocal:hb.test(pb[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":nb,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?sb(sb(a,n.ajaxSettings),b):sb(n.ajaxSettings,a)},ajaxPrefilter:qb(lb),ajaxTransport:qb(mb),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=n.ajaxSetup({},b),l=k.context||k,m=k.context&&(l.nodeType||l.jquery)?n(l):n.event,o=n.Deferred(),p=n.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!f){f={};while(b=gb.exec(e))f[b[1].toLowerCase()]=b[2]}b=f[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?e:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return c&&c.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||ob)+"").replace(eb,"").replace(jb,pb[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=n.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(h=kb.exec(k.url.toLowerCase()),k.crossDomain=!(!h||h[1]===pb[1]&&h[2]===pb[2]&&(h[3]||("http:"===h[1]?"80":"443"))===(pb[3]||("http:"===pb[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=n.param(k.data,k.traditional)),rb(lb,k,b,v),2===t)return v;i=n.event&&k.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!ib.test(k.type),d=k.url,k.hasContent||(k.data&&(d=k.url+=(db.test(d)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=fb.test(d)?d.replace(fb,"$1_="+cb++):d+(db.test(d)?"&":"?")+"_="+cb++)),k.ifModified&&(n.lastModified[d]&&v.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&v.setRequestHeader("If-None-Match",n.etag[d])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+nb+"; q=0.01":""):k.accepts["*"]);for(j in k.headers)v.setRequestHeader(j,k.headers[j]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(j in{success:1,error:1,complete:1})v[j](k[j]);if(c=rb(mb,k,b,v)){v.readyState=1,i&&m.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,c.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,f,h){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),c=void 0,e=h||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,f&&(u=tb(k,v,f)),u=ub(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=v.getResponseHeader("etag"),w&&(n.etag[d]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,i&&m.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),i&&(m.trigger("ajaxComplete",[v,k]),--n.active||n.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return this.each(n.isFunction(a)?function(b){n(this).wrapInner(a.call(this,b))}:function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var vb=/%20/g,wb=/\[\]$/,xb=/\r?\n/g,yb=/^(?:submit|button|image|reset|file)$/i,zb=/^(?:input|select|textarea|keygen)/i;function Ab(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||wb.test(a)?d(a,e):Ab(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Ab(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Ab(c,a[c],b,e);return d.join("&").replace(vb,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&zb.test(this.nodeName)&&!yb.test(a)&&(this.checked||!T.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(xb,"\r\n")}}):{name:b.name,value:c.replace(xb,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(a){}};var Bb=0,Cb={},Db={0:200,1223:204},Eb=n.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in Cb)Cb[a]()}),k.cors=!!Eb&&"withCredentials"in Eb,k.ajax=Eb=!!Eb,n.ajaxTransport(function(a){var b;return k.cors||Eb&&!a.crossDomain?{send:function(c,d){var e,f=a.xhr(),g=++Bb;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)f.setRequestHeader(e,c[e]);b=function(a){return function(){b&&(delete Cb[g],b=f.onload=f.onerror=null,"abort"===a?f.abort():"error"===a?d(f.status,f.statusText):d(Db[f.status]||f.status,f.statusText,"string"==typeof f.responseText?{text:f.responseText}:void 0,f.getAllResponseHeaders()))}},f.onload=b(),f.onerror=b("error"),b=Cb[g]=b("abort");try{f.send(a.hasContent&&a.data||null)}catch(h){if(b)throw h}},abort:function(){b&&b()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(d,e){b=n("<script>").prop({async:!0,charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&e("error"===a.type?404:200,a.type)}),l.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Fb=[],Gb=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Fb.pop()||n.expando+"_"+cb++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Gb.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Gb.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Gb,"$1"+e):b.jsonp!==!1&&(b.url+=(db.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Fb.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||l;var d=v.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=n.buildFragment([a],b,e),e&&e.length&&n(e).remove(),n.merge([],d.childNodes))};var Hb=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Hb)return Hb.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e,dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,f||[a.responseText,b,a])}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};var Ib=a.document.documentElement;function Jb(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(typeof d.getBoundingClientRect!==U&&(e=d.getBoundingClientRect()),c=Jb(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||Ib;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Ib})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(b,c){var d="pageYOffset"===c;n.fn[b]=function(e){return J(this,function(b,e,f){var g=Jb(b);return void 0===f?g?g[c]:b[e]:void(g?g.scrollTo(d?a.pageXOffset:f,d?f:a.pageYOffset):b[e]=f)},b,e,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=ya(k.pixelPosition,function(a,c){return c?(c=xa(a,b),va.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return J(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Kb=a.jQuery,Lb=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Lb),b&&a.jQuery===n&&(a.jQuery=Kb),n},typeof b===U&&(a.jQuery=a.$=n),n});

/*! promise-polyfill 2.1.0 */
!function(a){function b(a,b){return function(){a.apply(b,arguments)}}function c(a){if("object"!=typeof this)throw new TypeError("Promises must be constructed via new");if("function"!=typeof a)throw new TypeError("not a function");this._state=null,this._value=null,this._deferreds=[],i(a,b(e,this),b(f,this))}function d(a){var b=this;return null===this._state?void this._deferreds.push(a):void j(function(){var c=b._state?a.onFulfilled:a.onRejected;if(null===c)return void(b._state?a.resolve:a.reject)(b._value);var d;try{d=c(b._value)}catch(e){return void a.reject(e)}a.resolve(d)})}function e(a){try{if(a===this)throw new TypeError("A promise cannot be resolved with itself.");if(a&&("object"==typeof a||"function"==typeof a)){var c=a.then;if("function"==typeof c)return void i(b(c,a),b(e,this),b(f,this))}this._state=!0,this._value=a,g.call(this)}catch(d){f.call(this,d)}}function f(a){this._state=!1,this._value=a,g.call(this)}function g(){for(var a=0,b=this._deferreds.length;b>a;a++)d.call(this,this._deferreds[a]);this._deferreds=null}function h(a,b,c,d){this.onFulfilled="function"==typeof a?a:null,this.onRejected="function"==typeof b?b:null,this.resolve=c,this.reject=d}function i(a,b,c){var d=!1;try{a(function(a){d||(d=!0,b(a))},function(a){d||(d=!0,c(a))})}catch(e){if(d)return;d=!0,c(e)}}var j="function"==typeof setImmediate&&setImmediate||function(a){setTimeout(a,1)},k=Array.isArray||function(a){return"[object Array]"===Object.prototype.toString.call(a)};c.prototype["catch"]=function(a){return this.then(null,a)},c.prototype.then=function(a,b){var e=this;return new c(function(c,f){d.call(e,new h(a,b,c,f))})},c.all=function(){var a=Array.prototype.slice.call(1===arguments.length&&k(arguments[0])?arguments[0]:arguments);return new c(function(b,c){function d(f,g){try{if(g&&("object"==typeof g||"function"==typeof g)){var h=g.then;if("function"==typeof h)return void h.call(g,function(a){d(f,a)},c)}a[f]=g,0===--e&&b(a)}catch(i){c(i)}}if(0===a.length)return b([]);for(var e=a.length,f=0;f<a.length;f++)d(f,a[f])})},c.resolve=function(a){return a&&"object"==typeof a&&a.constructor===c?a:new c(function(b){b(a)})},c.reject=function(a){return new c(function(b,c){c(a)})},c.race=function(a){return new c(function(b,c){for(var d=0,e=a.length;e>d;d++)a[d].then(b,c)})},c._setImmediateFn=function(a){j=a},"undefined"!=typeof module&&module.exports?module.exports=c:a.Promise||(a.Promise=c)}(this);
define("Promise.min", function(){});

/*jshint
    expr:   true
*/
/*global self, respecEvents, respecConfig */

// Module core/base-runner
// The module in charge of running the whole processing pipeline.
// CONFIGURATION:
//  - trace: activate tracing for all modules
//  - preProcess: an array of functions that get called (with no parameters)
//      before anything else happens. This is not recommended and the feature is not
//      tested. Use with care, if you know what you're doing. Chances are you really
//      want to be using a new module with your own profile
//  - postProcess: the same as preProcess but at the end and with the same caveats
//  - afterEnd: a single function called at the end, after postProcess, with the
//      same caveats. These two coexist for historical reasons; please not that they
//      are all considered deprecated and may all be removed.

(function (GLOBAL) {
    // pubsub
    // freely adapted from http://higginsforpresident.net/js/static/jq.pubsub.js
    var handlers = {}
    ,   embedded = (top !== self)
    ;
    if (!("respecConfig" in window)) window.respecConfig = {};
    GLOBAL.respecEvents = {
        pub:    function (topic) {
            var args = Array.prototype.slice.call(arguments);
            args.shift();
            if (embedded && window.postMessage) {
                // Make sure all args are structured-cloneable.
                args = args.map(function(arg) {
                    return (arg.stack || arg) + '';
                });
                parent.postMessage({ topic: topic, args: args}, "*");
            }
            $.each(handlers[topic] || [], function () {
                this.apply(GLOBAL, args);
            });
        }
    ,   sub:    function (topic, cb) {
            if (!handlers[topic]) handlers[topic] = [];
            handlers[topic].push(cb);
            return [topic, cb];
        }
    ,   unsub:  function (opaque) { // opaque is whatever is returned by sub()
            var t = opaque[0];
            handlers[t] && $.each(handlers[t] || [], function (idx) {
                if (this == opaque[1]) handlers[t].splice(idx, 1);
            });
        }
    };
}(this));

// these need to be improved, or complemented with proper UI indications
if (window.console) {
    respecEvents.sub("warn", function (details) {
        console.warn("WARN: ", details);
    });
    respecEvents.sub("error", function (details) {
        console.error("ERROR: ", details);
    });
    respecEvents.sub("start", function (details) {
        if (respecConfig && respecConfig.trace) console.log(">>> began: " + details);
    });
    respecEvents.sub("end", function (details) {
        if (respecConfig && respecConfig.trace) console.log("<<< finished: " + details);
    });
    respecEvents.sub("start-all", function () {
        console.log("RESPEC PROCESSING STARTED");
        if ("respecVersion" in window && respecVersion) {
            console.log("RESPEC Version: " + respecVersion) ;
        }
    });
    respecEvents.sub("end-all", function () {
        console.log("RESPEC DONE!");
    });
}


define(
    'core/base-runner',["jquery", "Promise.min"],
    function () {
        return {
            runAll:    function (plugs) {
                // publish messages for beginning of all and end of all
                var pluginStack = 0;
                respecEvents.pub("start-all");
                respecEvents.sub("start", function () {
                    pluginStack++;
                });
                respecEvents.sub("end", function () {
                    pluginStack--;
                    if (!pluginStack) {
                        respecEvents.pub("end-all");
                        document.respecDone = true;
                    }
                });
                respecEvents.pub("start", "core/base-runner");

                if (respecConfig.preProcess) {
                    for (var i = 0; i < respecConfig.preProcess.length; i++) {
                        try { respecConfig.preProcess[i].apply(this); }
                        catch (e) { respecEvents.pub("error", e); }
                    }
                }

                var pipeline = Promise.resolve();
                // the first in the plugs is going to be us
                plugs.shift();
                plugs.forEach(function(plug) {
                    pipeline = pipeline.then(function () {
                        if (plug.run) {
                            return new Promise(function runPlugin(resolve, reject) {
                                var result = plug.run.call(plug, respecConfig, document, resolve, respecEvents);
                                // If the plugin returns a promise, have that
                                // control the end of the plugin's run.
                                // Otherwise, assume it'll call resolve() as a
                                // completion callback.
                                if (result) {
                                    resolve(result);
                                }
                            }).catch(function(e) {
                                respecEvents.pub("error", e);
                                respecEvents.pub("end", "unknown/with-error");
                            });
                        }
                        else return Promise.resolve();
                    });
                });
                return pipeline.then(function() {
                    if (respecConfig.postProcess) {
                        for (var i = 0; i < respecConfig.postProcess.length; i++) {
                            try { respecConfig.postProcess[i].apply(this); }
                            catch (e) { respecEvents.pub("error", e); }
                        }
                    }
                    if (respecConfig.afterEnd) {
                        try { respecConfig.afterEnd.apply(window, Array.prototype.slice.call(arguments)); }
                        catch (e) { respecEvents.pub("error", e); }
                    }
                    respecEvents.pub("end", "core/base-runner");
                });
            }
        };
    }
);

/**
 * http://www.openjs.com/scripts/events/keyboard_shortcuts/
 * Version : 2.01.B
 * By Binny V A
 * License : BSD
 */
shortcut = {
	'all_shortcuts':{},//All the shortcuts are stored in this array
	'add': function(shortcut_combination,callback,opt) {
		//Provide a set of default options
		var default_options = {
			'type':'keydown',
			'propagate':false,
			'disable_in_input':false,
			'target':document,
			'keycode':false
		}
		if(!opt) opt = default_options;
		else {
			for(var dfo in default_options) {
				if(typeof opt[dfo] == 'undefined') opt[dfo] = default_options[dfo];
			}
		}

		var ele = opt.target;
		if(typeof opt.target == 'string') ele = document.getElementById(opt.target);
		var ths = this;
		shortcut_combination = shortcut_combination.toLowerCase();

		//The function to be called at keypress
		var func = function(e) {
			e = e || window.event;
			
			if(opt['disable_in_input']) { //Don't enable shortcut keys in Input, Textarea fields
				var element;
				if(e.target) element=e.target;
				else if(e.srcElement) element=e.srcElement;
				if(element.nodeType==3) element=element.parentNode;

				if(element.tagName == 'INPUT' || element.tagName == 'TEXTAREA') return;
			}
	
			//Find Which key is pressed
			if (e.keyCode) code = e.keyCode;
			else if (e.which) code = e.which;
			var character = String.fromCharCode(code).toLowerCase();
			
			if(code == 188) character=","; //If the user presses , when the type is onkeydown
			if(code == 190) character="."; //If the user presses , when the type is onkeydown

			var keys = shortcut_combination.split("+");
			//Key Pressed - counts the number of valid keypresses - if it is same as the number of keys, the shortcut function is invoked
			var kp = 0;
			
			//Work around for stupid Shift key bug created by using lowercase - as a result the shift+num combination was broken
			var shift_nums = {
				"`":"~",
				"1":"!",
				"2":"@",
				"3":"#",
				"4":"$",
				"5":"%",
				"6":"^",
				"7":"&",
				"8":"*",
				"9":"(",
				"0":")",
				"-":"_",
				"=":"+",
				";":":",
				"'":"\"",
				",":"<",
				".":">",
				"/":"?",
				"\\":"|"
			};
			//Special Keys - and their codes
			var special_keys = {
				'esc':27,
				'escape':27,
				'tab':9,
				'space':32,
				'return':13,
				'enter':13,
				'backspace':8,
	
				'scrolllock':145,
				'scroll_lock':145,
				'scroll':145,
				'capslock':20,
				'caps_lock':20,
				'caps':20,
				'numlock':144,
				'num_lock':144,
				'num':144,
				
				'pause':19,
				'break':19,
				
				'insert':45,
				'home':36,
				'delete':46,
				'end':35,
				
				'pageup':33,
				'page_up':33,
				'pu':33,
	
				'pagedown':34,
				'page_down':34,
				'pd':34,
	
				'left':37,
				'up':38,
				'right':39,
				'down':40,
	
				'f1':112,
				'f2':113,
				'f3':114,
				'f4':115,
				'f5':116,
				'f6':117,
				'f7':118,
				'f8':119,
				'f9':120,
				'f10':121,
				'f11':122,
				'f12':123
			};
	
			var modifiers = { 
				shift: { wanted:false, pressed:false},
				ctrl : { wanted:false, pressed:false},
				alt  : { wanted:false, pressed:false},
				meta : { wanted:false, pressed:false}	//Meta is Mac specific
			};
                        
			if(e.ctrlKey)	modifiers.ctrl.pressed = true;
			if(e.shiftKey)	modifiers.shift.pressed = true;
			if(e.altKey)	modifiers.alt.pressed = true;
			if(e.metaKey)   modifiers.meta.pressed = true;
                        
			for(var i=0; k=keys[i],i<keys.length; i++) {
				//Modifiers
				if(k == 'ctrl' || k == 'control') {
					kp++;
					modifiers.ctrl.wanted = true;

				} else if(k == 'shift') {
					kp++;
					modifiers.shift.wanted = true;

				} else if(k == 'alt') {
					kp++;
					modifiers.alt.wanted = true;
				} else if(k == 'meta') {
					kp++;
					modifiers.meta.wanted = true;
				} else if(k.length > 1) { //If it is a special key
					if(special_keys[k] == code) kp++;
					
				} else if(opt['keycode']) {
					if(opt['keycode'] == code) kp++;

				} else { //The special keys did not match
					if(character == k) kp++;
					else {
						if(shift_nums[character] && e.shiftKey) { //Stupid Shift key bug created by using lowercase
							character = shift_nums[character]; 
							if(character == k) kp++;
						}
					}
				}
			}
			
			if(kp == keys.length && 
						modifiers.ctrl.pressed == modifiers.ctrl.wanted &&
						modifiers.shift.pressed == modifiers.shift.wanted &&
						modifiers.alt.pressed == modifiers.alt.wanted &&
						modifiers.meta.pressed == modifiers.meta.wanted) {
				callback(e);
	
				if(!opt['propagate']) { //Stop the event
					//e.cancelBubble is supported by IE - this will kill the bubbling process.
					e.cancelBubble = true;
					e.returnValue = false;
	
					//e.stopPropagation works in Firefox.
					if (e.stopPropagation) {
						e.stopPropagation();
						e.preventDefault();
					}
					return false;
				}
			}
		}
		this.all_shortcuts[shortcut_combination] = {
			'callback':func, 
			'target':ele, 
			'event': opt['type']
		};
		//Attach the function with the event
		if(ele.addEventListener) ele.addEventListener(opt['type'], func, false);
		else if(ele.attachEvent) ele.attachEvent('on'+opt['type'], func);
		else ele['on'+opt['type']] = func;
	}

	//Remove the shortcut - just specify the shortcut and I will remove the binding
    // 'remove':function(shortcut_combination) {
    //  shortcut_combination = shortcut_combination.toLowerCase();
    //  var binding = this.all_shortcuts[shortcut_combination];
    //  delete(this.all_shortcuts[shortcut_combination])
    //  if(!binding) return;
    //  var type = binding['event'];
    //  var ele = binding['target'];
    //  var callback = binding['callback'];
    // 
    //  if(ele.detachEvent) ele.detachEvent('on'+type, callback);
    //  else if(ele.removeEventListener) ele.removeEventListener(type, callback, false);
    //  else ele['on'+type] = false;
    // }
};
define("shortcut", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.shortcut;
    };
}(this)));

/*global respecEvents */

// Module core/ui
// Handles the ReSpec UI

// XXX TODO
//  - look at other UI things to add
//      - list issues
//      - lint: validator, link checker, check WebIDL, ID references
//      - save to GitHub
//  - make a release candidate that people can test
//  - once we have something decent, merge, ship as 3.2.0

define(
    'core/ui',["jquery", "shortcut"],
    function ($, shortcut) {
        var $menu = $("<div></div>")
                        .css({
                            background:     "#fff"
                        ,   border:         "1px solid #000"
                        ,   width:          "200px"
                        ,   display:        "none"
                        ,   textAlign:      "left"
                        ,   marginTop:      "5px"
                        ,   marginRight:    "5px"
                        })
                        ;
        var $modal
        ,   $overlay
        ,   errors = []
        ,   warnings = []
        ,   buttons = {}
        ,   $respecButton
        ,   errWarn = function (msg, arr, butName, bg, title) {
                arr.push(msg);
                if (!buttons[butName]) {
                    buttons[butName] = $("<button></button>")
                                            .css({
                                                background:     bg
                                            ,   color:          "#fff"
                                            ,   fontWeight:     "bold"
                                            ,   border:         "none"
                                            ,   borderRadius:   "5px"
                                            ,   marginLeft:     "5px"
                                            })
                                            .insertAfter($respecButton)
                                            .click(function () {
                                                var $ul = $("<ol></ol>");
                                                for (var i = 0, n = arr.length; i < n; i++) {
                                                    var err = arr[i];
                                                    if (err instanceof Error) {
                                                        $("<li><span></span> <a>\u229e</a><pre></pre></li>")
                                                            .appendTo($ul)
                                                            .find("span")
                                                                .text("[" + err.name + "] " + err.message)
                                                            .end()
                                                            .find("a")
                                                                .css({
                                                                    fontSize:   "1.1em"
                                                                ,   color:      "#999"
                                                                ,   cursor:     "pointer"
                                                                })
                                                                .click(function () {
                                                                    var $a = $(this)
                                                                    ,   state = $a.text()
                                                                    ,   $pre = $a.parent().find("pre");
                                                                    if (state === "\u229e") {
                                                                        $a.text("\u229f");
                                                                        $pre.show();
                                                                    }
                                                                    else {
                                                                        $a.text("\u229e");
                                                                        $pre.hide();
                                                                    }
                                                                })
                                                            .end()
                                                            .find("pre")
                                                                .text(err.stack)
                                                                .css({
                                                                    marginLeft: "0"
                                                                ,   maxWidth:   "100%"
                                                                ,   overflowY:  "hidden"
                                                                ,   overflowX:  "scroll"
                                                                })
                                                                .hide()
                                                            .end();
                                                    }
                                                    else {
                                                        $("<li></li>").text(err).appendTo($ul);
                                                    }
                                                }
                                                ui.freshModal(title, $ul);
                                            })
                                            ;
                }
                buttons[butName].text(arr.length);
            }
        ;
        var conf, doc, msg;
        var ui = {
            run:    function (_conf, _doc, cb, _msg) {
                conf = _conf, doc = _doc, msg = _msg;
                msg.pub("start", "core/ui");
                var $div = $("<div id='respec-ui' class='removeOnSave'></div>", doc)
                                .css({
                                    position:   "fixed"
                                ,   top:        "20px"
                                ,   right:      "20px"
                                ,   width:      "202px"
                                ,   textAlign:  "right"
                                })
                                .appendTo($("body", doc))
                                ;
                $respecButton = $("<button>ReSpec</button>")
                                    .css({
                                        background:     "#fff"
                                    ,   fontWeight:     "bold"
                                    ,   border:         "1px solid #ccc"
                                    ,   borderRadius:   "5px"
                                    })
                                    .click(function () {
                                        $menu.toggle();
                                    })
                                    .appendTo($div)
                                    ;
                $menu.appendTo($div);
                shortcut.add("Esc", function () {
                    ui.closeModal();
                });
                shortcut.add("Ctrl+Alt+Shift+E", function () {
                    if (buttons.error) buttons.error.click();
                });
                shortcut.add("Ctrl+Alt+Shift+W", function () {
                    if (buttons.warning) buttons.warning.click();
                });
                msg.pub("end", "core/ui");
                cb();
            }
        ,   addCommand: function (label, module, keyShort) {
                var handler = function () {
                    $menu.hide();
                    require([module], function (mod) {
                        mod.show(ui, conf, doc, msg);
                    });
                };
                $("<button></button>")
                    .css({
                        background:     "#fff"
                    ,   border:         "none"
                    ,   borderBottom:   "1px solid #ccc"
                    ,   width:          "100%"
                    ,   textAlign:      "left"
                    ,   fontSize:       "inherit"
                    })
                    .text(label)
                    .click(handler)
                    .appendTo($menu)
                    ;
                    if (keyShort) shortcut.add(keyShort, handler);
            }
        ,   error:  function (msg) {
                errWarn(msg, errors, "error", "#c00", "Errors");
            }
        ,   warning:  function (msg) {
                errWarn(msg, warnings, "warning", "#f60", "Warnings");
            }
        ,   closeModal: function () {
                if ($overlay) $overlay.fadeOut(200, function () { $overlay.remove(); $overlay = null; });
                if (!$modal) return;
                $modal.remove();
                $modal = null;
            }
        ,   freshModal: function (title, content) {
                if ($modal) $modal.remove();
                if ($overlay) $overlay.remove();
                var width = 500;
                $overlay = $("<div id='respec-overlay' class='removeOnSave'></div>").hide();
                $modal = $("<div id='respec-modal' class='removeOnSave'><h3></h3><div class='inside'></div></div>").hide();
                $modal.find("h3").text(title);
                $modal.find(".inside").append(content);
                $("body")
                    .append($overlay)
                    .append($modal);
                $overlay
                    .click(this.closeModal)
                    .css({
                        display:    "block"
                    ,   opacity:    0
                    ,   position:   "fixed"
                    ,   zIndex:     10000
                    ,   top:        "0px"
                    ,   left:       "0px"
                    ,   height:     "100%"
                    ,   width:      "100%"
                    ,   background: "#000"
                    })
                    .fadeTo(200, 0.5)
                    ;
                $modal
                    .css({
                        display:        "block"
                    ,   position:       "fixed"
                    ,   opacity:        0
                    ,   zIndex:         11000
                    ,   left:           "50%"
                    ,   marginLeft:     -(width/2) + "px"
                    ,   top:            "100px"
                    ,   background:     "#fff"
                    ,   border:         "5px solid #666"
                    ,   borderRadius:   "5px"
                    ,   width:          width + "px"
                    ,   padding:        "0 20px 20px 20px"
                    ,   maxHeight:      ($(window).height() - 150) + "px"
                    ,   overflowY:      "auto"
                    })
                    .fadeTo(200, 1)
                    ;
            }
        };
        if (window.respecEvents) respecEvents.sub("error", function (details) {
            ui.error(details);
        });
        if (window.respecEvents) respecEvents.sub("warn", function (details) {
            ui.warning(details);
        });
        return ui;
    }
);

// Module core/include-config
// Inject's the document's configuration into the head as JSON.

define(
  'core/include-config',[],
  function () {
    'use strict';
    return {
      run: function (conf, doc, cb, msg) {
        msg.pub('start', 'core/include-config');
        var initialUserConfig;
        try {
          if (Object.assign) {
            initialUserConfig = Object.assign({}, conf);
          } else {
            initialUserConfig = JSON.parse(JSON.stringify(conf));
          }
        } catch (err) {
          initialUserConfig = {};
        }
        msg.sub('end-all', function () {
          var script = doc.createElement('script');
          script.id = 'initialUserConfig';
          var confFilter = function (key, val) {
            // DefinitionMap contains array of DOM elements that aren't serializable
            // we replace them by their id
            if (key === 'definitionMap') {
              var ret = {};
              Object
                .keys(val)
                .forEach(function (k) {
                  ret[k] = val[k].map(function (d) {
                    return d[0].id;
                  });
                });
              return ret;
            }
            return val;
          };
          script.innerHTML = JSON.stringify(initialUserConfig, confFilter, 2);
          script.type = 'application/json';
          doc.head.appendChild(script);
          conf.initialUserConfig = initialUserConfig;
        });
        msg.pub('end', 'core/include-config');
        cb();
      }
    };
  }
);


// Module core/override-configuration
// A helper module that makes it possible to override settings specified in respecConfig
// by passing them as a query string. This is useful when you just want to make a few
// tweaks to a document before generating the snapshot, without mucking with the source.
// For example, you can change the status and date by appending:
//      ?specStatus=LC;publishDate=2012-03-15
// Note that fields are separated by semicolons and not ampersands.
// TODO
//  There could probably be a UI for this to make it even simpler.

define(
    'core/override-configuration',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/override-configuration");
                if (location.search) {
                    var confs = location.search.replace(/^\?/, "").split(";");
                    for (var i = 0, n = confs.length; i < n; i++) {
                        var items = confs[i].split("=", 2);
                        var k = decodeURI(items[0]), v = decodeURI(items[1]).replace(/%3D/g, "=");
                        // we could process more types here, as needed
                        if (v === "true") v = true;
                        else if (v === "false") v = false;
                        else if (v === "null") v = null;
                        else if (/\[\]$/.test(k)) {
                            k = k.replace(/\[\]/, "");
                            v = JSON.parse(v);
                        }
                        try {
                            conf[k] = JSON.parse(v);
                        } catch (err) {
                            conf[k] = v;
                        }
                    }
                }
                msg.pub("end", "core/override-configuration");
                cb();
            }
        };
    }
);


// Module core/default-root-attr
// In cases where it is recommended that a document specify its language and writing direction,
// this module will supply defaults of "en" and "ltr" respectively (but won't override
// specified values).
// Be careful in using this that these defaults make sense for the type of document you are
// publishing.

define(
    'core/default-root-attr',[],
    function () {
        return {
            run:    function (config, doc, cb, msg) {
                msg.pub("start", "core/default-root-attr");
                var $root = $(doc.documentElement);
                if (!$root.attr("lang")) {
                    $root.attr("lang", "en");
                    if (!$root.attr("dir")) $root.attr("dir", "ltr");
                }
                msg.pub("end", "core/default-root-attr");
                cb();
            }
        };
    }
);


// Module w3c/l10n
// Looks at the lang attribute on the root element and uses it to manage the config.l10n object so
// that other parts of the system can localise their text

define(
    'w3c/l10n',[],
    function () {
        var l10n = {
            en: {
                    this_version:               "This version:"
                ,   latest_published_version:   "Latest published version:"
                ,   latest_editors_draft:       "Latest editor's draft:"
                ,   editor:                     "Editor:"
                ,   editors:                    "Editors:"
                ,   author:                     "Author:"
                ,   authors:                    "Authors:"
                ,   abstract:                   "Abstract"
                ,   sotd:                       "Status of This Document"
                ,   status_at_publication:      "This section describes the status of this document at the time of its publication. Other documents may supersede this document. A list of current W3C publications and the latest revision of this technical report can be found in the <a href='http://www.w3.org/TR/'>W3C technical reports index</a> at http://www.w3.org/TR/."
                ,   toc:                        "Table of Contents"
                ,   tof:                        "Table of Figures"
                ,   tot:                        "Table of Tables"
                ,   toe:                        "Table of Equations"
                ,   note:                       "Note"
                ,   impnote:                    "Implementation Note"
                ,   fig:                        "Figure "
                ,   tbl:                        "Table "
                ,   eqn:                        "Equation "
                ,   bug_tracker:                "Bug tracker:"
                ,   file_a_bug:                 "file a bug"
                ,   open_bugs:                  "open bugs"
                ,   open_parens:                "("
                ,   close_parens:               ")"
            }
            ,   ko: {
                    this_version:               "현재 버전:"
                ,   latest_published_version:   "최신 버전:"
                ,   latest_editors_draft:       "Latest editor's draft:"
                ,   editor:                     "Editor:"
                ,   editors:                    "Editors:"
                ,   author:                     "저자:"
                ,   authors:                    "저자:"
                ,   abstract:                   "요약"
                ,   sotd:                       "현재 문서의 상태"
                ,   status_at_publication:      "This section describes the status of this document at the time of its publication. Other documents may supersede this document. A list of current W3C publications and the latest revision of this technical report can be found in the <a href='http://www.w3.org/TR/'>W3C technical reports index</a> at http://www.w3.org/TR/."
                ,   toc:                        "Table of Contents"
                ,   tof:                        "Table of Figures"
                ,   tot:                        "Table of Tables"
                ,   toe:                        "Table of Equations"
                ,   note:                       "Note"
                ,   impnote:                    "Implementation Note"
                ,   fig:                        "그림 "
                ,   tbl:                        "Table "
                ,   eqn:                        "Equation. "
                ,   bug_tracker:                "Bug tracker:"
                ,   file_a_bug:                 "file a bug"
                ,   open_bugs:                  "open bugs"
                ,   open_parens:                "("
                ,   close_parens:               ")"
            }
            ,   zh: {
                    this_version:               "本版本："
                ,   latest_published_version:   "最新发布草稿："
                ,   latest_editors_draft:       "最新编辑草稿："
                ,   editor:                     "编辑："
                ,   editors:                    "编辑们："
                ,   author:                     "Author:"
                ,   authors:                    "Authors:"
                ,   abstract:                   "摘要"
                ,   sotd:                       "关于本文档"
                ,   status_at_publication:      "本章节描述了本文档的发布状态。其它更新版本可能会覆盖本文档。W3C的文档列 表和最新版本可通过<a href='http://www.w3.org/TR/'>W3C技术报告</a>索引访问。"
                ,   toc:                        "内容大纲"
                ,   tof:                        "Table of Figures"
                ,   tot:                        "Table of Tables"
                ,   toe:                        "Table of Equations"
                ,   impnote:                    "Implementation Note"
                ,   note:                       "注"
                ,   fig:                        "圖"
                ,   tbl:                        "Table "
                ,   eqn:                        "Equation "
                ,   bug_tracker:                "错误跟踪："
                ,   file_a_bug:                 "反馈错误"
                ,   open_bugs:                  "修正中的错误"
                ,   open_parens:                "（"
                ,   close_parens:               "）"
            }
        };
        l10n["zh-hans"] = l10n.zh;
        l10n["zh-cn"] = l10n.zh;
        
        return {
            run:    function (config, doc, cb, msg) {
                msg.pub("start", "w3c/l10n");
                var lang = $(doc.documentElement).attr("lang") || "en";
                config.l10n = l10n[lang] ? l10n[lang] : l10n.en;
                msg.pub("end", "w3c/l10n");
                cb();
            }
        };
    }
);

/**
 * marked - A markdown parser (https://github.com/chjj/marked)
 * Copyright (c) 2011-2012, Christopher Jeffrey. (MIT Licensed)
 */

;(function() {

/**
 * Block-Level Grammar
 */

var block = {
  newline: /^\n+/,
  code: /^( {4}[^\n]+\n*)+/,
  fences: noop,
  hr: /^( *[-*_]){3,} *(?:\n+|$)/,
  heading: /^ *(#{1,6}) *([^\n]+?) *#* *(?:\n+|$)/,
  lheading: /^([^\n]+)\n *(=|-){3,} *\n*/,
  blockquote: /^( *>[^\n]+(\n[^\n]+)*\n*)+/,
  list: /^( *)(bull) [^\0]+?(?:hr|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
  html: /^ *(?:comment|closed|closing) *(?:\n{2,}|\s*$)/,
  def: /^ *\[([^\]]+)\]: *([^\s]+)(?: +["(]([^\n]+)[")])? *(?:\n+|$)/,
  paragraph: /^([^\n]+\n?(?!hr|heading|lheading|blockquote|tag|def))+\n*/,
  text: /^[^\n]+/
};

block.bullet = /(?:[*+-]|\d+\.)/;
block.item = /^( *)(bull) [^\n]*(?:\n(?!\1bull )[^\n]*)*/;
block.item = replace(block.item, 'gm')
  (/bull/g, block.bullet)
  ();

block.list = replace(block.list)
  (/bull/g, block.bullet)
  ('hr', /\n+(?=(?: *[-*_]){3,} *(?:\n+|$))/)
  ();

block.html = replace(block.html)
  ('comment', /<!--[^\0]*?-->/)
  ('closed', /<(tag)[^\0]+?<\/\1>/)
  ('closing', /<tag(?:"[^"]*"|'[^']*'|[^'">])*?>/)
  (/tag/g, tag())
  ();

block.paragraph = replace(block.paragraph)
  ('hr', block.hr)
  ('heading', block.heading)
  ('lheading', block.lheading)
  ('blockquote', block.blockquote)
  ('tag', '<' + tag())
  ('def', block.def)
  ();

block.normal = {
  fences: block.fences,
  paragraph: block.paragraph
};

block.gfm = {
  fences: /^ *(```|~~~) *(\w+)? *\n([^\0]+?)\s*\1 *(?:\n+|$)/,
  paragraph: /^/
};

block.gfm.paragraph = replace(block.paragraph)
  ('(?!', '(?!' + block.gfm.fences.source.replace('\\1', '\\2') + '|')
  ();

/**
 * Block Lexer
 */

block.lexer = function(src) {
  var tokens = [];

  tokens.links = {};

  src = src
    .replace(/\r\n|\r/g, '\n')
    .replace(/\t/g, '    ');

  return block.token(src, tokens, true);
};

block.token = function(src, tokens, top) {
  var src = src.replace(/^ +$/gm, '')
    , next
    , loose
    , cap
    , item
    , space
    , i
    , l;

  while (src) {
    // newline
    if (cap = block.newline.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[0].length > 1) {
        tokens.push({
          type: 'space'
        });
      }
    }

    // code
    if (cap = block.code.exec(src)) {
      src = src.substring(cap[0].length);
      cap = cap[0].replace(/^ {4}/gm, '');
      tokens.push({
        type: 'code',
        text: !options.pedantic
          ? cap.replace(/\n+$/, '')
          : cap
      });
      continue;
    }

    // fences (gfm)
    if (cap = block.fences.exec(src)) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'code',
        lang: cap[2],
        text: cap[3]
      });
      continue;
    }

    // heading
    if (cap = block.heading.exec(src)) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'heading',
        depth: cap[1].length,
        text: cap[2]
      });
      continue;
    }

    // lheading
    if (cap = block.lheading.exec(src)) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'heading',
        depth: cap[2] === '=' ? 1 : 2,
        text: cap[1]
      });
      continue;
    }

    // hr
    if (cap = block.hr.exec(src)) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'hr'
      });
      continue;
    }

    // blockquote
    if (cap = block.blockquote.exec(src)) {
      src = src.substring(cap[0].length);

      tokens.push({
        type: 'blockquote_start'
      });

      cap = cap[0].replace(/^ *> ?/gm, '');

      // Pass `top` to keep the current
      // "toplevel" state. This is exactly
      // how markdown.pl works.
      block.token(cap, tokens, top);

      tokens.push({
        type: 'blockquote_end'
      });

      continue;
    }

    // list
    if (cap = block.list.exec(src)) {
      src = src.substring(cap[0].length);

      tokens.push({
        type: 'list_start',
        ordered: isFinite(cap[2])
      });

      // Get each top-level item.
      cap = cap[0].match(block.item);

      next = false;
      l = cap.length;
      i = 0;

      for (; i < l; i++) {
        item = cap[i];

        // Remove the list item's bullet
        // so it is seen as the next token.
        space = item.length;
        item = item.replace(/^ *([*+-]|\d+\.) +/, '');

        // Outdent whatever the
        // list item contains. Hacky.
        if (~item.indexOf('\n ')) {
          space -= item.length;
          item = !options.pedantic
            ? item.replace(new RegExp('^ {1,' + space + '}', 'gm'), '')
            : item.replace(/^ {1,4}/gm, '');
        }

        // Determine whether item is loose or not.
        // Use: /(^|\n)(?! )[^\n]+\n\n(?!\s*$)/
        // for discount behavior.
        loose = next || /\n\n(?!\s*$)/.test(item);
        if (i !== l - 1) {
          next = item[item.length-1] === '\n';
          if (!loose) loose = next;
        }

        tokens.push({
          type: loose
            ? 'loose_item_start'
            : 'list_item_start'
        });

        // Recurse.
        block.token(item, tokens);

        tokens.push({
          type: 'list_item_end'
        });
      }

      tokens.push({
        type: 'list_end'
      });

      continue;
    }

    // html
    if (cap = block.html.exec(src)) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: options.sanitize
          ? 'paragraph'
          : 'html',
        pre: cap[1] === 'pre',
        text: cap[0]
      });
      continue;
    }

    // def
    if (top && (cap = block.def.exec(src))) {
      src = src.substring(cap[0].length);
      tokens.links[cap[1].toLowerCase()] = {
        href: cap[2],
        title: cap[3]
      };
      continue;
    }

    // top-level paragraph
    if (top && (cap = block.paragraph.exec(src))) {
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'paragraph',
        text: cap[0]
      });
      continue;
    }

    // text
    if (cap = block.text.exec(src)) {
      // Top-level should never reach here.
      src = src.substring(cap[0].length);
      tokens.push({
        type: 'text',
        text: cap[0]
      });
      continue;
    }
  }

  return tokens;
};

/**
 * Inline Processing
 */

var inline = {
  escape: /^\\([\\`*{}\[\]()#+\-.!_>])/,
  autolink: /^<([^ >]+(@|:\/)[^ >]+)>/,
  url: noop,
  tag: /^<!--[^\0]*?-->|^<\/?\w+(?:"[^"]*"|'[^']*'|[^'">])*?>/,
  link: /^!?\[(inside)\]\(href\)/,
  reflink: /^!?\[(inside)\]\s*\[([^\]]*)\]/,
  nolink: /^!?\[((?:\[[^\]]*\]|[^\[\]])*)\]/,
  strong: /^__([^\0]+?)__(?!_)|^\*\*([^\0]+?)\*\*(?!\*)/,
  em: /^\b_((?:__|[^\0])+?)_\b|^\*((?:\*\*|[^\0])+?)\*(?!\*)/,
  code: /^(`+)([^\0]*?[^`])\1(?!`)/,
  br: /^ {2,}\n(?!\s*$)/,
  text: /^[^\0]+?(?=[\\<!\[_*`]| {2,}\n|$)/
};

inline._linkInside = /(?:\[[^\]]*\]|[^\]]|\](?=[^\[]*\]))*/;
inline._linkHref = /\s*<?([^\s]*?)>?(?:\s+['"]([^\0]*?)['"])?\s*/;

inline.link = replace(inline.link)
  ('inside', inline._linkInside)
  ('href', inline._linkHref)
  ();

inline.reflink = replace(inline.reflink)
  ('inside', inline._linkInside)
  ();

inline.normal = {
  url: inline.url,
  strong: inline.strong,
  em: inline.em,
  text: inline.text
};

inline.pedantic = {
  strong: /^__(?=\S)([^\0]*?\S)__(?!_)|^\*\*(?=\S)([^\0]*?\S)\*\*(?!\*)/,
  em: /^_(?=\S)([^\0]*?\S)_(?!_)|^\*(?=\S)([^\0]*?\S)\*(?!\*)/
};

inline.gfm = {
  url: /^(https?:\/\/[^\s]+[^.,:;"')\]\s])/,
  text: /^[^\0]+?(?=[\\<!\[_*`]|https?:\/\/| {2,}\n|$)/
};

/**
 * Inline Lexer
 */

inline.lexer = function(src) {
  var out = ''
    , links = tokens.links
    , link
    , text
    , href
    , cap;

  while (src) {
    // escape
    if (cap = inline.escape.exec(src)) {
      src = src.substring(cap[0].length);
      out += cap[1];
      continue;
    }

    // autolink
    if (cap = inline.autolink.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[2] === '@') {
        text = cap[1][6] === ':'
          ? mangle(cap[1].substring(7))
          : mangle(cap[1]);
        href = mangle('mailto:') + text;
      } else {
        text = escape(cap[1]);
        href = text;
      }
      out += '<a href="'
        + href
        + '">'
        + text
        + '</a>';
      continue;
    }

    // url (gfm)
    if (cap = inline.url.exec(src)) {
      src = src.substring(cap[0].length);
      text = escape(cap[1]);
      href = text;
      out += '<a href="'
        + href
        + '">'
        + text
        + '</a>';
      continue;
    }

    // tag
    if (cap = inline.tag.exec(src)) {
      src = src.substring(cap[0].length);
      out += options.sanitize
        ? escape(cap[0])
        : cap[0];
      continue;
    }

    // link
    if (cap = inline.link.exec(src)) {
      src = src.substring(cap[0].length);
      out += outputLink(cap, {
        href: cap[2],
        title: cap[3]
      });
      continue;
    }

    // reflink, nolink
    if ((cap = inline.reflink.exec(src))
        || (cap = inline.nolink.exec(src))) {
      src = src.substring(cap[0].length);
      link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
      link = links[link.toLowerCase()];
      if (!link || !link.href) {
        out += cap[0][0];
        src = cap[0].substring(1) + src;
        continue;
      }
      out += outputLink(cap, link);
      continue;
    }

    // strong
    if (cap = inline.strong.exec(src)) {
      src = src.substring(cap[0].length);
      out += '<strong>'
        + inline.lexer(cap[2] || cap[1])
        + '</strong>';
      continue;
    }

    // em
    if (cap = inline.em.exec(src)) {
      src = src.substring(cap[0].length);
      out += '<em>'
        + inline.lexer(cap[2] || cap[1])
        + '</em>';
      continue;
    }

    // code
    if (cap = inline.code.exec(src)) {
      src = src.substring(cap[0].length);
      out += '<code>'
        + escape(cap[2], true)
        + '</code>';
      continue;
    }

    // br
    if (cap = inline.br.exec(src)) {
      src = src.substring(cap[0].length);
      out += '<br>';
      continue;
    }

    // text
    if (cap = inline.text.exec(src)) {
      src = src.substring(cap[0].length);
      out += escape(cap[0]);
      continue;
    }
  }

  return out;
};

function outputLink(cap, link) {
  if (cap[0][0] !== '!') {
    return '<a href="'
      + escape(link.href)
      + '"'
      + (link.title
      ? ' title="'
      + escape(link.title)
      + '"'
      : '')
      + '>'
      + inline.lexer(cap[1])
      + '</a>';
  } else {
    return '<img src="'
      + escape(link.href)
      + '" alt="'
      + escape(cap[1])
      + '"'
      + (link.title
      ? ' title="'
      + escape(link.title)
      + '"'
      : '')
      + '>';
  }
}

/**
 * Parsing
 */

var tokens
  , token;

function next() {
  return token = tokens.pop();
}

function tok() {
  switch (token.type) {
    case 'space': {
      return '';
    }
    case 'hr': {
      return '<hr>\n';
    }
    case 'heading': {
      return '<h'
        + token.depth
        + '>'
        + inline.lexer(token.text)
        + '</h'
        + token.depth
        + '>\n';
    }
    case 'code': {
      if (options.highlight) {
        token.code = options.highlight(token.text, token.lang);
        if (token.code != null && token.code !== token.text) {
          token.escaped = true;
          token.text = token.code;
        }
      }

      if (!token.escaped) {
        token.text = escape(token.text, true);
      }

      return '<pre><code'
        + (token.lang
        ? ' class="lang-'
        + token.lang
        + '"'
        : '')
        + '>'
        + token.text
        + '</code></pre>\n';
    }
    case 'blockquote_start': {
      var body = '';

      while (next().type !== 'blockquote_end') {
        body += tok();
      }

      return '<blockquote>\n'
        + body
        + '</blockquote>\n';
    }
    case 'list_start': {
      var type = token.ordered ? 'ol' : 'ul'
        , body = '';

      while (next().type !== 'list_end') {
        body += tok();
      }

      return '<'
        + type
        + '>\n'
        + body
        + '</'
        + type
        + '>\n';
    }
    case 'list_item_start': {
      var body = '';

      while (next().type !== 'list_item_end') {
        body += token.type === 'text'
          ? parseText()
          : tok();
      }

      return '<li>'
        + body
        + '</li>\n';
    }
    case 'loose_item_start': {
      var body = '';

      while (next().type !== 'list_item_end') {
        body += tok();
      }

      return '<li>'
        + body
        + '</li>\n';
    }
    case 'html': {
      return !token.pre && !options.pedantic
        ? inline.lexer(token.text)
        : token.text;
    }
    case 'paragraph': {
      return '<p>'
        + inline.lexer(token.text)
        + '</p>\n';
    }
    case 'text': {
      return '<p>'
        + parseText()
        + '</p>\n';
    }
  }
}

function parseText() {
  var body = token.text
    , top;

  while ((top = tokens[tokens.length-1])
         && top.type === 'text') {
    body += '\n' + next().text;
  }

  return inline.lexer(body);
}

function parse(src) {
  tokens = src.reverse();

  var out = '';
  while (next()) {
    out += tok();
  }

  tokens = null;
  token = null;

  return out;
}

/**
 * Helpers
 */

function escape(html, encode) {
  return html
    .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mangle(text) {
  var out = ''
    , l = text.length
    , i = 0
    , ch;

  for (; i < l; i++) {
    ch = text.charCodeAt(i);
    if (Math.random() > 0.5) {
      ch = 'x' + ch.toString(16);
    }
    out += '&#' + ch + ';';
  }

  return out;
}

function tag() {
  var tag = '(?!(?:'
    + 'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code'
    + '|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo'
    + '|span|br|wbr|ins|del|img)\\b)\\w+(?!:/|@)\\b';

  return tag;
}

function replace(regex, opt) {
  regex = regex.source;
  opt = opt || '';
  return function self(name, val) {
    if (!name) return new RegExp(regex, opt);
    val = val.source || val;
    val = val.replace(/(^|[^\[])\^/g, '$1');
    regex = regex.replace(name, val);
    return self;
  };
}

function noop() {}
noop.exec = noop;

/**
 * Marked
 */

function marked(src, opt) {
  setOptions(opt);
  return parse(block.lexer(src));
}

/**
 * Options
 */

var options
  , defaults;

function setOptions(opt) {
  if (!opt) opt = defaults;
  if (options === opt) return;
  options = opt;

  if (options.gfm) {
    block.fences = block.gfm.fences;
    block.paragraph = block.gfm.paragraph;
    inline.text = inline.gfm.text;
    inline.url = inline.gfm.url;
  } else {
    block.fences = block.normal.fences;
    block.paragraph = block.normal.paragraph;
    inline.text = inline.normal.text;
    inline.url = inline.normal.url;
  }

  if (options.pedantic) {
    inline.em = inline.pedantic.em;
    inline.strong = inline.pedantic.strong;
  } else {
    inline.em = inline.normal.em;
    inline.strong = inline.normal.strong;
  }
}

marked.options =
marked.setOptions = function(opt) {
  defaults = opt;
  setOptions(opt);
  return marked;
};

marked.setOptions({
  gfm: true,
  pedantic: false,
  sanitize: false,
  highlight: null
});

/**
 * Expose
 */

marked.parser = function(src, opt) {
  setOptions(opt);
  return parse(src);
};

marked.lexer = function(src, opt) {
  setOptions(opt);
  return block.lexer(src);
};

marked.parse = marked;

if (typeof module !== 'undefined') {
  module.exports = marked;
} else {
  this.marked = marked;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());
define("core/marked", function(){});

/*global marked*/
// Module core/markdown
// Handles the optional markdown processing.
//
// Markdown support is optional. It is enabled by setting the `format`
// property of the configuration object to "markdown."
//
// We use marked for parsing Markdown.
//
// Note that the content of SECTION elements, and elements with a
// class name of "note", "issue" or "req" are also parsed.
//
// The HTML created by the Markdown parser is turned into a nested
// structure of SECTION elements, following the strucutre given by
// the headings. For example, the following markup:
//
//     Title
//     -----
//
//     ### Subtitle ###
//
//     Here's some text.
//
//     ### Another subtitle ###
//
//     More text.
//
// will be transformed into:
//
//     <section>
//       <h2>Title</h2>
//       <section>
//         <h3>Subtitle</h3>
//         <p>Here's some text.</p>
//       </section>
//       <section>
//         <h3>Another subtitle</h3>
//         <p>More text.</p>
//       </section>
//     </section>
//

define(
    'core/markdown',['core/marked'],
    function () {
        marked.setOptions({
            gfm: false,
            pedantic: false,
            sanitize: false
        });

        function makeBuilder(doc) {
            var root = doc.createDocumentFragment()
            ,   stack = [root]
            ,   current = root
            ,   HEADERS = /H[1-6]/
            ;

            function findPosition(header) {
                return parseInt(header.tagName.charAt(1), 10);
            }

            function findParent(position) {
                var parent;
                while (position > 0) {
                    position--;
                    parent = stack[position];
                    if (parent) return parent;
                }
            }

            function findHeader(node) {
                node = node.firstChild;
                while (node) {
                    if (HEADERS.test(node.tagName)) {
                        return node;
                    }
                    node = node.nextSibling;
                }
                return null;
            }

            function addHeader(header) {
              var section = doc.createElement('section')
              ,   position = findPosition(header)
              ;

              section.appendChild(header);
              findParent(position).appendChild(section);
              stack[position] = section;
              stack.length = position + 1;
              current = section;
            }

            function addSection(node, process) {
                var header = findHeader(node)
                ,   position = header ? findPosition(header) : 1
                ,   parent = findParent(position)
                ;

                if (header) {
                    node.removeChild(header);
                }

                node.appendChild(process(node));

                if (header) {
                    node.insertBefore(header, node.firstChild);
                }

                parent.appendChild(node);
                current = parent;
            }

            function addElement(node) {
                current.appendChild(node);
            }

            function getRoot() {
                return root;
            }

            return {
                addHeader: addHeader,
                addSection: addSection,
                addElement: addElement,
                getRoot: getRoot
            };
        }

        return {
            toHTML: function(text) {
                // As markdown is pulled from HTML > is already escaped, and
                // thus blockquotes aren't picked up by the parser. This fixes
                // it.
                text = text.replace(/&gt;/g, '>');
                text = this.removeLeftPadding(text);
                return marked(text);
            },

            removeLeftPadding: function(text) {
                // Handles markdown content being nested
                // inside elements with soft tabs. E.g.:
                // <div>
                //     This is a title
                //     ---------------
                //
                //     And this more text.
                // </div
                //
                // Gets turned into:
                // <div>
                //     <h2>This is a title</h2>
                //     <p>And this more text.</p>
                // </div
                //
                // Rather than:
                // <div>
                //     <pre><code>This is a title
                // ---------------
                //
                // And this more text.</code></pre>
                // </div

                var match = text.match(/\n[ ]+\S/g)
                ,   current
                ,   min
                ;

                if (match) {
                    min = match[0].length - 2;
                    for (var i = 0, length = match.length; i < length; i++) {
                        current = match[i].length - 2;
                        if (typeof min == 'undefined' || min > current) {
                            min = current;
                        }
                    }

                    var re = new RegExp("\n[ ]{0," + min + "}", "g");
                    text = text.replace(re, '\n');
                }
                return text;
            },

            processBody: function(doc) {
                var fragment = doc.createDocumentFragment()
                ,   div = doc.createElement('div')
                ,   node
                ;

                div.innerHTML = this.toHTML(doc.body.innerHTML);
                while (node = div.firstChild) {
                    fragment.appendChild(node);
                }
                return fragment;
            },

            processSections: function(doc) {
                var self = this;
                $('section', doc).each(function() {
                    this.innerHTML = self.toHTML(this.innerHTML);
                });
            },

            processIssuesNotesAndReqs: function(doc) {
                var div = doc.createElement('div');
                var self = this;
                $('.issue, .note, .req', doc).each(function() {
                    div.innerHTML = self.toHTML(this.innerHTML);
                    this.innerHTML = '';
                    var node = div.firstChild;
                    while (node.firstChild) {
                        this.appendChild(node.firstChild);
                    }
                });
            },

            structure: function(fragment, doc) {
                function process(root) {
                    var node
                    ,   tagName
                    ,   stack = makeBuilder(doc)
                    ;

                    while (node = root.firstChild) {
                        if (node.nodeType !== 1) {
                            root.removeChild(node);
                            continue;
                        }
                        tagName = node.tagName.toLowerCase();
                        switch (tagName) {
                            case 'h1':
                            case 'h2':
                            case 'h3':
                            case 'h4':
                            case 'h5':
                            case 'h6':
                                stack.addHeader(node);
                                break;
                            case 'section':
                                stack.addSection(node, process);
                                break;
                            default:
                                stack.addElement(node);
                        }
                    }

                    return stack.getRoot();
                }

                return process(fragment);
            },

            run: function (conf, doc, cb, msg) {
                msg.pub("start", "core/markdown");
                if (conf.format === 'markdown') {
                    // Marked, the Markdown implementation we're currently using
                    // parses markdown nested in markup (unless it's in a section element).
                    // Turns out this is both what we need and generally not what other
                    // parsers do.
                    // In case we switch to another parser later on, we'll need to
                    // uncomment the below line of code.
                    //
                    // this.processIssuesNotesAndReqs(doc);
                    this.processSections(doc);
                    // the processing done here blows away the ReSpec UI (or rather, the elements
                    // that it needs to reference). So we save a reference to the original element
                    // and re-inject it later
                    var $rsUI = $("#respec-ui");
                    var fragment = this.structure(this.processBody(doc), doc);
                    doc.body.innerHTML = '';
                    doc.body.appendChild(fragment);
                    if ($rsUI.length) $("#respec-ui").replaceWith($rsUI);
                }
                msg.pub("end", "core/markdown");
                cb();
            }
        };
    }
);

/*
 RequireJS text 1.0.8 Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 Available via the MIT or new BSD license.
 see: http://github.com/jrburke/requirejs for details
*/
(function(){var k=["Msxml2.XMLHTTP","Microsoft.XMLHTTP","Msxml2.XMLHTTP.4.0"],m=/^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,n=/<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,i=typeof location!=="undefined"&&location.href,o=i&&location.protocol&&location.protocol.replace(/\:/,""),p=i&&location.hostname,q=i&&(location.port||void 0),j=[];define('text',[],function(){var e,l;e={version:"1.0.8",strip:function(a){if(a){var a=a.replace(m,""),c=a.match(n);c&&(a=c[1])}else a="";return a},jsEscape:function(a){return a.replace(/(['\\])/g,
"\\$1").replace(/[\f]/g,"\\f").replace(/[\b]/g,"\\b").replace(/[\n]/g,"\\n").replace(/[\t]/g,"\\t").replace(/[\r]/g,"\\r")},createXhr:function(){var a,c,b;if(typeof XMLHttpRequest!=="undefined")return new XMLHttpRequest;else if(typeof ActiveXObject!=="undefined")for(c=0;c<3;c++){b=k[c];try{a=new ActiveXObject(b)}catch(f){}if(a){k=[b];break}}return a},parseName:function(a){var c=!1,b=a.indexOf("."),f=a.substring(0,b),a=a.substring(b+1,a.length),b=a.indexOf("!");b!==-1&&(c=a.substring(b+1,a.length),
c=c==="strip",a=a.substring(0,b));return{moduleName:f,ext:a,strip:c}},xdRegExp:/^((\w+)\:)?\/\/([^\/\\]+)/,useXhr:function(a,c,b,f){var d=e.xdRegExp.exec(a),g;if(!d)return!0;a=d[2];d=d[3];d=d.split(":");g=d[1];d=d[0];return(!a||a===c)&&(!d||d===b)&&(!g&&!d||g===f)},finishLoad:function(a,c,b,f,d){b=c?e.strip(b):b;d.isBuild&&(j[a]=b);f(b)},load:function(a,c,b,f){if(f.isBuild&&!f.inlineText)b();else{var d=e.parseName(a),g=d.moduleName+"."+d.ext,h=c.toUrl(g),r=f&&f.text&&f.text.useXhr||e.useXhr;!i||r(h,
o,p,q)?e.get(h,function(c){e.finishLoad(a,d.strip,c,b,f)}):c([g],function(a){e.finishLoad(d.moduleName+"."+d.ext,d.strip,a,b,f)})}},write:function(a,c,b){if(j.hasOwnProperty(c)){var f=e.jsEscape(j[c]);b.asModule(a+"!"+c,"define(function () { return '"+f+"';});\n")}},writeFile:function(a,c,b,f,d){var c=e.parseName(c),g=c.moduleName+"."+c.ext,h=b.toUrl(c.moduleName+"."+c.ext)+".js";e.load(g,b,function(){var b=function(a){return f(h,a)};b.asModule=function(a,b){return f.asModule(a,h,b)};e.write(a,g,
b,d)},d)}};if(e.createXhr())e.get=function(a,c){var b=e.createXhr();b.open("GET",a,!0);b.onreadystatechange=function(){b.readyState===4&&c(b.responseText)};b.send(null)};else if(typeof process!=="undefined"&&process.versions&&process.versions.node)l=require.nodeRequire("fs"),e.get=function(a,c){var b=l.readFileSync(a,"utf8");b.indexOf("\ufeff")===0&&(b=b.substring(1));c(b)};else if(typeof Packages!=="undefined")e.get=function(a,c){var b=new java.io.File(a),f=java.lang.System.getProperty("line.separator"),
b=new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(b),"utf-8")),d,e,h="";try{d=new java.lang.StringBuffer;(e=b.readLine())&&e.length()&&e.charAt(0)===65279&&(e=e.substring(1));for(d.append(e);(e=b.readLine())!==null;)d.append(f),d.append(e);h=String(d.toString())}finally{b.close()}c(h)};return e})})();


define('text!core/css/respec2.css',[],function () { return '/*****************************************************************\n * ReSpec 3 CSS\n * Robin Berjon - http://berjon.com/\n *****************************************************************/\n\n/* --- INLINES --- */\nem.rfc2119 {\n    text-transform:     lowercase;\n    font-variant:       small-caps;\n    font-style:         normal;\n    font-size:          larger;\n    color:              #900;\n}\n\nh1 acronym, h2 acronym, h3 acronym, h4 acronym, h5 acronym, h6 acronym, a acronym,\nh1 abbr, h2 abbr, h3 abbr, h4 abbr, h5 abbr, h6 abbr, a abbr {\n    border: none;\n}\n\ndfn {\n    font-weight:    bold;\n}\n\na.internalDFN {\n    color:  inherit;\n    border-bottom:  1px solid #99c;\n    text-decoration:    none;\n}\n\na.externalDFN {\n    color:  inherit;\n    border-bottom:  1px dotted #ccc;\n    text-decoration:    none;\n}\n\na.bibref {\n    text-decoration:    none;\n}\n\ncite .bibref {\n    font-style: normal;\n}\n\ncode {\n    color:  #C83500;\n}\n\n/* --- TOC --- */\n.toc a, .tof a, .tot a {\n    text-decoration:    none;\n}\n\n.tocline a .secno,\n.tofline a .figno,\n.totline a .tblno {\n    color:  #000;\n}\n\nul.toc > li.tocline,\nul.tof > li.tofline,\nul.tot > li.totline {\n    list-style: none outside none;\n}\n\n.caption {\n    margin-top: 0.5em;\n    font-style:   italic;\n}\n\n/* --- TABLE --- */\ntable.simple {\n    border-spacing: 0;\n    border-collapse:    collapse;\n    border-bottom:  3px solid #0060A9; /* #38197a; pcisig purple */ /* respec orig #005a9c;*/\n}\n\n.simple th {\n    background: #0060A9; /* #38197a; /*#005a9c;*/\n    color:  #fff;\n    padding:    3px 5px;\n    text-align: left;\n}\n\n.simple th[scope="row"] {\n    background: inherit;\n    color:  inherit;\n    border-top: 1px solid #ddd;\n}\n\n.simple td {\n    padding:    3px 10px;\n    border-top: 1px solid #ddd;\n}\n\n.simple tr:nth-child(even) {\n    background: #E5F4FF; /* ß#F6F1FE; /*#f0f6ff;*/\n}\n\n/* --- DL --- */\n.section dd > p:first-child {\n    margin-top: 0;\n}\n\n.section dd > p:last-child {\n    margin-bottom: 0;\n}\n\n.section dd {\n    margin-bottom:  1em;\n}\n\n.section dl.attrs dd, .section dl.eldef dd {\n    margin-bottom:  0;\n}\n\nspan.respec-error {\n    color: red;\n    font-size: 12pt;\n    font-weight: bold;\n    font-family: monospace;\n}\n\n@media print {\n    .removeOnSave {\n        display: none;\n    }\n}\n';});


// Module core/style
// Inserts the CSS that ReSpec uses into the document.
// IMPORTANT NOTE
//  The extraCSS configuration option is now deprecated. People rarely use it, and it
//  does not work well with the growing restrictions that browsers impose on loading
//  local content. You can still add your own styles: for that you will have to create
//  a plugin that declares the css as a dependency and create a build of your new
//  ReSpec profile. It's rather easy, really.
// CONFIGURATION
//  - noReSpecCSS: if you're using a profile that loads this module but you don't want
//    the style, set this to true

define(
    'core/style',["text!core/css/respec2.css"],
    function (css) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/style");
                if (conf.extraCSS) {
                    msg.pub("warn", "The 'extraCSS' configuration property is now deprecated.");
                }
                if (!conf.noReSpecCSS) {
                    $("<style/>").appendTo($("head", $(doc)))
                                 .text(css);
                }
                msg.pub("end", "core/style");
                cb();
            }
        };
    }
);

/*global respecEvents, define */
/*jshint browser:true, laxcomma:true */

// Module core/utils
// As the name implies, this contains a ragtag gang of methods that just don't fit
// anywhere else.

define(
    'core/utils',["jquery"],
    function ($) {
        // --- JQUERY EXTRAS -----------------------------------------------------------------------
        // Applies to any jQuery object containing elements, changes their name to the one give, and
        // return a jQuery object containing the new elements
        $.fn.renameElement = function (name) {
            var arr = [];
            this.each(function () {
                var $newEl = $(this.ownerDocument.createElement(name));
                // I forget why this didn't work, maybe try again
                // $newEl.attr($(this).attr());
                for (var i = 0, n = this.attributes.length; i < n; i++) {
                    var at = this.attributes[i];
                    $newEl[0].setAttributeNS(at.namespaceURI, at.name, at.value);
                }
                $(this).contents().appendTo($newEl);
                $(this).replaceWith($newEl);
                arr.push($newEl[0]);
            });
            return $(arr);
        };

        // For any element, returns an array of title strings that applies
        // the algorithm used for determining the
        // actual title of a <dfn> element (but can apply to other as well).
        $.fn.dfnTitle = function () {
            var title;
            if (this.attr("title")) {
                title = this.attr("title");
            } else if (this.contents().length === 1 &&
                       this.children("abbr, acronym").length === 1 &&
                       this.find(":first-child").attr("title")) {
                title = this.find(":first-child").attr("title");
            } else {
                title = this.text();
            }
            title = title.toLowerCase().replace(/^\s+/, "").replace(/\s+$/, "").split(/\s+/).join(" ");
//            console.log("pre-title= \"" + title + "\"");
            title = title.split(/[\|]+/);
//            console.log("   length= " + title.length + "  \"" + title.join("|||") + "\"");
            return title;
        };
        //
        // if args.isDefinition is true, then the element is a definition, not a
        // reference to a definition.  Any @title or @lt will be replaced with
        // @data-lt to be consistent with Bikeshed / Shepherd.
        //
        // This method now *prefers* the data-lt attribute for the list of
        // titles.  That attribute is added by this method to dfn elements, so
        // subsequent calls to this method will return the data-lt based list.
        //
        // This method will publish a warning if a title is used on a definition
        // instead of an @lt (as per specprod mailing list discussion).
        $.fn.getDfnTitles = function ( args ) {
            var titles = [];
            var theAttr = "";
            var titleString = "";
            var normalizedText = "";
            //data-lt-noDefault avoid using the text content of a definition
            //in the definition list.
            if (this.attr("data-lt-noDefault") === undefined){
                normalizedText = utils.norm(this.text()).toLowerCase();
            }
            // allow @lt to be consistent with bikeshed
            if (this.attr("data-lt") || this.attr("lt")) {
                theAttr = this.attr("data-lt") ? "data-lt" : "lt";
                // prefer @data-lt for the list of title aliases
                titleString = this.attr(theAttr).toLowerCase();
                if (normalizedText !== "") {
                    //Regex: starts with the "normalizedText|"
                    var startsWith = new RegExp("^" + normalizedText + "\\|");
                    // Use the definition itself as first item, so to avoid
                    // having to declare the definition twice.
                    if (!startsWith.test(titleString)) {
                        titleString = normalizedText + "|" + titleString;
                    }
                }
            }
            else if (this.attr("title")) {
                // allow @title for backward compatibility
                titleString = this.attr("title");
                theAttr = "title";
                respecEvents.pub("warn", "Using deprecated attribute @title for '" + this.text() + "': see http://w3.org/respec/guide.html#definitions-and-linking");
            }
            else if (this.contents().length == 1
                     && this.children("abbr, acronym").length == 1
                     && this.find(":first-child").attr("title")) {
                titleString = this.find(":first-child").attr("title");
            }
            else {
                titleString = this.text();
            }
            // now we have a string of one or more titles
            titleString = utils.norm(titleString).toLowerCase();
            if (args && args.isDefinition === true) {
                // if it came from an attribute, replace that with data-lt as per contract with Shepherd
                if (theAttr) {
                    this.attr("data-lt", titleString);
                    this.removeAttr(theAttr) ;
                }
                // if there is no pre-defined type, assume it is a 'dfn'
                if (!this.attr("dfn-type")) {
                    this.attr("data-dfn-type", "dfn");
                }
                else {
                    this.attr("data-dfn-type", this.attr("dfn-type"));
                    this.removeAttr("dfn-type");
                }
            }
            titleString.split('|').forEach( function( item ) {
                    if (item != "") {
                        titles.push(item);
                    }
                });
            return titles;
        };

        // For any element (usually <a>), returns an array of targets that
        // element might refer to, of the form
        // {for_: 'interfacename', title: 'membername'}.
        //
        // For an element like:
        //  <p link-for="Int1"><a for="Int2">Int3.member</a></p>
        // we'll return:
        //  * {for_: "int2", title: "int3.member"}
        //  * {for_: "int3", title: "member"}
        //  * {for_: "", title: "int3.member"}
        $.fn.linkTargets = function () {
            var elem = this;
            var link_for = (elem.attr("for") || elem.attr("data-for") || elem.closest("[link-for]").attr("link-for") || elem.closest("[data-link-for]").attr("data-link-for") || "").toLowerCase();
            var titles = elem.getDfnTitles();
            var result = [];
            $.each(titles, function() {
                    result.push({for_: link_for, title: this});
                    var split = this.split('.');
                    if (split.length === 2) {
                        // If there are multiple '.'s, this won't match an
                        // Interface/member pair anyway.
                        result.push({for_: split[0], title: split[1]});
                    }
                    result.push({for_: "", title: this});
                });
            return result;
        };


        // Applied to an element, sets an ID for it (and returns it), using a specific prefix
        // if provided, and a specific text if given.
        $.fn.makeID = function (pfx, txt, noLC) {
            if (this.attr("id")) return this.attr("id");
            if (!txt) txt = this.attr("title") ? this.attr("title") : this.text();
            txt = txt.replace(/^\s+/, "").replace(/\s+$/, "");
            var id = noLC ? txt : txt.toLowerCase();
            id = id.split(/[^\-.0-9a-z_]+/i).join("-").replace(/^-+/, "").replace(/-+$/, "");
            if (/\.$/.test(id)) id += "x"; // trailing . doesn't play well with jQuery
            if (id.length > 0 && /^[^a-z]/i.test(id)) id = "x" + id;
            if (id.length === 0) id = "generatedID";
            if (pfx) id = pfx + "-" + id;
            var inc = 1
            ,   doc = this[0].ownerDocument;
            if ($("#" + id, doc).length) {
                while ($("#" + id + "-" + inc, doc).length) inc++;
                id += "-" + inc;
            }
            this.attr("id", id);
            return id;
        };

        // Returns all the descendant text nodes of an element. Note that those nodes aren't
        // returned as a jQuery array since I'm not sure if that would make too much sense.
        $.fn.allTextNodes = function (exclusions) {
            var textNodes = [],
                excl = {};
            for (var i = 0, n = exclusions.length; i < n; i++) excl[exclusions[i]] = true;
            function getTextNodes (node) {
                if (node.nodeType === 1 && excl[node.localName.toLowerCase()]) return;
                if (node.nodeType === 3) textNodes.push(node);
                else {
                    for (var i = 0, len = node.childNodes.length; i < len; ++i) getTextNodes(node.childNodes[i]);
                }
            }
            getTextNodes(this[0]);
            return textNodes;
        };


        var utils = {
            // --- SET UP
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/utils");
                msg.pub("end", "core/utils");
                cb();
            }

            // --- RESPEC STUFF -------------------------------------------------------------------------------
        ,   removeReSpec:   function (doc) {
                $(".remove, script[data-requiremodule]", doc).remove();
            }

            // --- STRING HELPERS -----------------------------------------------------------------------------
            // Takes an array and returns a string that separates each of its items with the proper commas and
            // "and". The second argument is a mapping function that can convert the items before they are
            // joined
        ,   joinAnd:    function (arr, mapper) {
                if (!arr || !arr.length) return "";
                mapper = mapper || function (ret) { return ret; };
                var ret = "";
                if (arr.length === 1) return mapper(arr[0], 0);
                for (var i = 0, n = arr.length; i < n; i++) {
                    if (i > 0) {
                        if (n === 2) ret += ' ';
                        else         ret += ', ';
                        if (i == n - 1) ret += 'and ';
                    }
                    ret += mapper(arr[i], i);
                }
                return ret;
            }
            // Takes a string, applies some XML escapes, and returns the escaped string.
            // Note that overall using either Handlebars' escaped output or jQuery is much
            // preferred to operating on strings directly.
        ,   xmlEscape:    function (s) {
                return s.replace(/&/g, "&amp;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/</g, "&lt;");
            }

            // Trims string at both ends and replaces all other white space with a single space
        ,   norm:   function (str) {
                return str.replace(/^\s+/, "").replace(/\s+$/, "").split(/\s+/).join(" ");
            }


            // --- DATE HELPERS -------------------------------------------------------------------------------
            // Takes a Date object and an optional separator and returns the year,month,day representation with
            // the custom separator (defaulting to none) and proper 0-padding
        ,   concatDate: function (date, sep) {
                if (!sep) sep = "";
                return "" + date.getFullYear() + sep + this.lead0(date.getMonth() + 1) + sep + this.lead0(date.getDate());
            }

            // takes a string, prepends a "0" if it is of length 1, does nothing otherwise
        ,   lead0:  function (str) {
                str = "" + str;
                return (str.length == 1) ? "0" + str : str;
            }

            // takes a YYYY-MM-DD date and returns a Date object for it
        ,   parseSimpleDate:    function (str) {
                return new Date(str.substr(0, 4), (str.substr(5, 2) - 1), str.substr(8, 2));
            }

            // takes what document.lastModified returns and produces a Date object for it
        ,   parseLastModified:    function (str) {
                if (!str) return new Date();
                return new Date(Date.parse(str));
                // return new Date(str.substr(6, 4), (str.substr(0, 2) - 1), str.substr(3, 2));
            }

            // list of human names for months (in English)
        ,   humanMonths: ["January", "February", "March", "April", "May", "June", "July",
                          "August", "September", "October", "November", "December"]

            // given either a Date object or a date in YYYY-MM-DD format, return a human-formatted
            // date suitable for use in a W3C specification
        ,   humanDate:  function (date) {
                if (!(date instanceof Date)) date = this.parseSimpleDate(date);
                return this.lead0(date.getDate()) + " " + this.humanMonths[date.getMonth()] + " " + date.getFullYear();
            }
            // given either a Date object or a date in YYYY-MM-DD format, return an ISO formatted
            // date suitable for use in a xsd:datetime item
        ,   isoDate:    function (date) {
                if (!(date instanceof Date)) date = this.parseSimpleDate(date);
                // return "" + date.getUTCFullYear() +'-'+ this.lead0(date.getUTCMonth() + 1)+'-' + this.lead0(date.getUTCDate()) +'T'+this.lead0(date.getUTCHours())+':'+this.lead0(date.getUTCMinutes()) +":"+this.lead0(date.getUTCSeconds())+'+0000';
                return date.toISOString() ;
            }


            // --- STYLE HELPERS ------------------------------------------------------------------------------
            // take a document and either a link or an array of links to CSS and appends a <link/> element
            // to the head pointing to each
        ,   linkCSS:  function (doc, styles) {
                if (!$.isArray(styles)) styles = [styles];
                $.each(styles, function (i, css) {
                    $('head', doc).append($("<link/>").attr({ rel: 'stylesheet', href: css }));
                });
            }

            // --- APPENDIX NUMBERING --------------------------------------------------------------------------
            // take a a number and return the corresponding Appendix String. 0 means 'A', ... 25 means 'Z, 26
            // means 'AA', 26**26-1 means 'ZZ, 26**26 means 'AAA', etc.
            , appendixMap: function (n) {
                var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                if (n < alphabet.length) {
                    return alphabet.charAt(n);
                } else {
                    return (this.appendixMap(Math.floor(n / alphabet.length)) +
                            alphabet.charAt(Math.mod(n, alphabet.length)));
                }
            }

            // --- TRANSFORMATIONS ------------------------------------------------------------------------------
            // Run list of transforms over content and return result.
            // Please note that this is a legacy method that is only kept in order to maintain compatibility
            // with RSv1. It is therefore not tested and not actively supported.
        ,   runTransforms: function (content, flist) {
                var args = [this, content]
                ,   funcArgs = Array.prototype.slice.call(arguments)
                ;
                funcArgs.shift(); funcArgs.shift();
                args = args.concat(funcArgs);
                if (flist) {
                    var methods = flist.split(/\s+/);
                    for (var j = 0; j < methods.length; j++) {
                        var meth = methods[j];
                        if (window[meth]) {
                            // the initial call passed |this| directly, so we keep it that way
                            try {
                                content = window[meth].apply(this, args);
                            }
                            catch (e) {
                                respecEvents.pub("warn", "call to " + meth + "() failed with " + e) ;
                            }
                        }
                    }
                }
                return content;
            }
        };
        return utils;
    }
);

/*globals define */
/*jshint browser: true */

// Module pcisig/style
// Inserts a link to the appropriate PCISIG style for the specification's maturity level.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)

define(
    'pcisig/style',["core/utils"/*,
     "text!../../stylesheets/unofficial.css"*/],
    function (utils/*, inlinecss*/) {
        "use strict";
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/style");
                if (!conf.specStatus) msg.pub("error", "Configuration 'specStatus' is not set, required for pcisig/style");
                var statStyle = conf.specStatus;
                var css = "https://";
//                if (statStyle === "unofficial") {
                css += "sglaser.github.io/respec/stylesheets/unofficial.css";
//                css = "respec/stylesheets/unofficial.css";
//                }
//                else if (statStyle === "base") {
//                    css += "sglaser.github.io/respec/stylesheets/base.css";
//                }
//                else {
//                    css += "sglaser.github.io/respec/stylesheets/pcisig-" + statStyle + ".css";
//                }
                if (conf.cssOverride) {
                    css = conf.cssOverride;
                }
                utils.linkCSS(doc, css);
//                $("<style/>").appendTo($("head", $(doc))).text(inlinecss);
//                console.log("inlinecss.length = " + inlinecss.length);
                msg.pub("end", "pcisig/style");
                cb();
            }
        };
    }
);

// lib/handlebars/base.js
var Handlebars = {};

Handlebars.VERSION = "1.0.beta.6";

Handlebars.helpers  = {};
Handlebars.partials = {};

Handlebars.registerHelper = function(name, fn, inverse) {
  if(inverse) { fn.not = inverse; }
  this.helpers[name] = fn;
};

Handlebars.registerPartial = function(name, str) {
  this.partials[name] = str;
};

Handlebars.registerHelper('helperMissing', function(arg) {
  if(arguments.length === 2) {
    return undefined;
  } else {
    throw new Error("Could not find property '" + arg + "'");
  }
});

var toString = Object.prototype.toString, functionType = "[object Function]";

Handlebars.registerHelper('blockHelperMissing', function(context, options) {
  var inverse = options.inverse || function() {}, fn = options.fn;


  var ret = "";
  var type = toString.call(context);

  if(type === functionType) { context = context.call(this); }

  if(context === true) {
    return fn(this);
  } else if(context === false || context == null) {
    return inverse(this);
  } else if(type === "[object Array]") {
    if(context.length > 0) {
      for(var i=0, j=context.length; i<j; i++) {
        ret = ret + fn(context[i]);
      }
    } else {
      ret = inverse(this);
    }
    return ret;
  } else {
    return fn(context);
  }
});

Handlebars.registerHelper('each', function(context, options) {
  var fn = options.fn, inverse = options.inverse;
  var ret = "";

  if(context && context.length > 0) {
    for(var i=0, j=context.length; i<j; i++) {
      ret = ret + fn(context[i]);
    }
  } else {
    ret = inverse(this);
  }
  return ret;
});

Handlebars.registerHelper('if', function(context, options) {
  var type = toString.call(context);
  if(type === functionType) { context = context.call(this); }

  if(!context || Handlebars.Utils.isEmpty(context)) {
    return options.inverse(this);
  } else {
    return options.fn(this);
  }
});

Handlebars.registerHelper('unless', function(context, options) {
  var fn = options.fn, inverse = options.inverse;
  options.fn = inverse;
  options.inverse = fn;

  return Handlebars.helpers['if'].call(this, context, options);
});

Handlebars.registerHelper('with', function(context, options) {
  return options.fn(context);
});

Handlebars.registerHelper('log', function(context) {
  Handlebars.log(context);
});
;
// lib/handlebars/compiler/parser.js
/* Jison generated parser */
var handlebars = (function(){

var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"root":3,"program":4,"EOF":5,"statements":6,"simpleInverse":7,"statement":8,"openInverse":9,"closeBlock":10,"openBlock":11,"mustache":12,"partial":13,"CONTENT":14,"COMMENT":15,"OPEN_BLOCK":16,"inMustache":17,"CLOSE":18,"OPEN_INVERSE":19,"OPEN_ENDBLOCK":20,"path":21,"OPEN":22,"OPEN_UNESCAPED":23,"OPEN_PARTIAL":24,"params":25,"hash":26,"param":27,"STRING":28,"INTEGER":29,"BOOLEAN":30,"hashSegments":31,"hashSegment":32,"ID":33,"EQUALS":34,"pathSegments":35,"SEP":36,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",14:"CONTENT",15:"COMMENT",16:"OPEN_BLOCK",18:"CLOSE",19:"OPEN_INVERSE",20:"OPEN_ENDBLOCK",22:"OPEN",23:"OPEN_UNESCAPED",24:"OPEN_PARTIAL",28:"STRING",29:"INTEGER",30:"BOOLEAN",33:"ID",34:"EQUALS",36:"SEP"},
productions_: [0,[3,2],[4,3],[4,1],[4,0],[6,1],[6,2],[8,3],[8,3],[8,1],[8,1],[8,1],[8,1],[11,3],[9,3],[10,3],[12,3],[12,3],[13,3],[13,4],[7,2],[17,3],[17,2],[17,2],[17,1],[25,2],[25,1],[27,1],[27,1],[27,1],[27,1],[26,1],[31,2],[31,1],[32,3],[32,3],[32,3],[32,3],[21,1],[35,3],[35,1]],
performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

var $0 = $$.length - 1;
switch (yystate) {
case 1: return $$[$0-1] 
break;
case 2: this.$ = new yy.ProgramNode($$[$0-2], $$[$0]) 
break;
case 3: this.$ = new yy.ProgramNode($$[$0]) 
break;
case 4: this.$ = new yy.ProgramNode([]) 
break;
case 5: this.$ = [$$[$0]] 
break;
case 6: $$[$0-1].push($$[$0]); this.$ = $$[$0-1] 
break;
case 7: this.$ = new yy.InverseNode($$[$0-2], $$[$0-1], $$[$0]) 
break;
case 8: this.$ = new yy.BlockNode($$[$0-2], $$[$0-1], $$[$0]) 
break;
case 9: this.$ = $$[$0] 
break;
case 10: this.$ = $$[$0] 
break;
case 11: this.$ = new yy.ContentNode($$[$0]) 
break;
case 12: this.$ = new yy.CommentNode($$[$0]) 
break;
case 13: this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1]) 
break;
case 14: this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1]) 
break;
case 15: this.$ = $$[$0-1] 
break;
case 16: this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1]) 
break;
case 17: this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1], true) 
break;
case 18: this.$ = new yy.PartialNode($$[$0-1]) 
break;
case 19: this.$ = new yy.PartialNode($$[$0-2], $$[$0-1]) 
break;
case 20: 
break;
case 21: this.$ = [[$$[$0-2]].concat($$[$0-1]), $$[$0]] 
break;
case 22: this.$ = [[$$[$0-1]].concat($$[$0]), null] 
break;
case 23: this.$ = [[$$[$0-1]], $$[$0]] 
break;
case 24: this.$ = [[$$[$0]], null] 
break;
case 25: $$[$0-1].push($$[$0]); this.$ = $$[$0-1]; 
break;
case 26: this.$ = [$$[$0]] 
break;
case 27: this.$ = $$[$0] 
break;
case 28: this.$ = new yy.StringNode($$[$0]) 
break;
case 29: this.$ = new yy.IntegerNode($$[$0]) 
break;
case 30: this.$ = new yy.BooleanNode($$[$0]) 
break;
case 31: this.$ = new yy.HashNode($$[$0]) 
break;
case 32: $$[$0-1].push($$[$0]); this.$ = $$[$0-1] 
break;
case 33: this.$ = [$$[$0]] 
break;
case 34: this.$ = [$$[$0-2], $$[$0]] 
break;
case 35: this.$ = [$$[$0-2], new yy.StringNode($$[$0])] 
break;
case 36: this.$ = [$$[$0-2], new yy.IntegerNode($$[$0])] 
break;
case 37: this.$ = [$$[$0-2], new yy.BooleanNode($$[$0])] 
break;
case 38: this.$ = new yy.IdNode($$[$0]) 
break;
case 39: $$[$0-2].push($$[$0]); this.$ = $$[$0-2]; 
break;
case 40: this.$ = [$$[$0]] 
break;
}
},
table: [{3:1,4:2,5:[2,4],6:3,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],22:[1,13],23:[1,14],24:[1,15]},{1:[3]},{5:[1,16]},{5:[2,3],7:17,8:18,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,19],20:[2,3],22:[1,13],23:[1,14],24:[1,15]},{5:[2,5],14:[2,5],15:[2,5],16:[2,5],19:[2,5],20:[2,5],22:[2,5],23:[2,5],24:[2,5]},{4:20,6:3,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,4],22:[1,13],23:[1,14],24:[1,15]},{4:21,6:3,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,4],22:[1,13],23:[1,14],24:[1,15]},{5:[2,9],14:[2,9],15:[2,9],16:[2,9],19:[2,9],20:[2,9],22:[2,9],23:[2,9],24:[2,9]},{5:[2,10],14:[2,10],15:[2,10],16:[2,10],19:[2,10],20:[2,10],22:[2,10],23:[2,10],24:[2,10]},{5:[2,11],14:[2,11],15:[2,11],16:[2,11],19:[2,11],20:[2,11],22:[2,11],23:[2,11],24:[2,11]},{5:[2,12],14:[2,12],15:[2,12],16:[2,12],19:[2,12],20:[2,12],22:[2,12],23:[2,12],24:[2,12]},{17:22,21:23,33:[1,25],35:24},{17:26,21:23,33:[1,25],35:24},{17:27,21:23,33:[1,25],35:24},{17:28,21:23,33:[1,25],35:24},{21:29,33:[1,25],35:24},{1:[2,1]},{6:30,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],22:[1,13],23:[1,14],24:[1,15]},{5:[2,6],14:[2,6],15:[2,6],16:[2,6],19:[2,6],20:[2,6],22:[2,6],23:[2,6],24:[2,6]},{17:22,18:[1,31],21:23,33:[1,25],35:24},{10:32,20:[1,33]},{10:34,20:[1,33]},{18:[1,35]},{18:[2,24],21:40,25:36,26:37,27:38,28:[1,41],29:[1,42],30:[1,43],31:39,32:44,33:[1,45],35:24},{18:[2,38],28:[2,38],29:[2,38],30:[2,38],33:[2,38],36:[1,46]},{18:[2,40],28:[2,40],29:[2,40],30:[2,40],33:[2,40],36:[2,40]},{18:[1,47]},{18:[1,48]},{18:[1,49]},{18:[1,50],21:51,33:[1,25],35:24},{5:[2,2],8:18,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,2],22:[1,13],23:[1,14],24:[1,15]},{14:[2,20],15:[2,20],16:[2,20],19:[2,20],22:[2,20],23:[2,20],24:[2,20]},{5:[2,7],14:[2,7],15:[2,7],16:[2,7],19:[2,7],20:[2,7],22:[2,7],23:[2,7],24:[2,7]},{21:52,33:[1,25],35:24},{5:[2,8],14:[2,8],15:[2,8],16:[2,8],19:[2,8],20:[2,8],22:[2,8],23:[2,8],24:[2,8]},{14:[2,14],15:[2,14],16:[2,14],19:[2,14],20:[2,14],22:[2,14],23:[2,14],24:[2,14]},{18:[2,22],21:40,26:53,27:54,28:[1,41],29:[1,42],30:[1,43],31:39,32:44,33:[1,45],35:24},{18:[2,23]},{18:[2,26],28:[2,26],29:[2,26],30:[2,26],33:[2,26]},{18:[2,31],32:55,33:[1,56]},{18:[2,27],28:[2,27],29:[2,27],30:[2,27],33:[2,27]},{18:[2,28],28:[2,28],29:[2,28],30:[2,28],33:[2,28]},{18:[2,29],28:[2,29],29:[2,29],30:[2,29],33:[2,29]},{18:[2,30],28:[2,30],29:[2,30],30:[2,30],33:[2,30]},{18:[2,33],33:[2,33]},{18:[2,40],28:[2,40],29:[2,40],30:[2,40],33:[2,40],34:[1,57],36:[2,40]},{33:[1,58]},{14:[2,13],15:[2,13],16:[2,13],19:[2,13],20:[2,13],22:[2,13],23:[2,13],24:[2,13]},{5:[2,16],14:[2,16],15:[2,16],16:[2,16],19:[2,16],20:[2,16],22:[2,16],23:[2,16],24:[2,16]},{5:[2,17],14:[2,17],15:[2,17],16:[2,17],19:[2,17],20:[2,17],22:[2,17],23:[2,17],24:[2,17]},{5:[2,18],14:[2,18],15:[2,18],16:[2,18],19:[2,18],20:[2,18],22:[2,18],23:[2,18],24:[2,18]},{18:[1,59]},{18:[1,60]},{18:[2,21]},{18:[2,25],28:[2,25],29:[2,25],30:[2,25],33:[2,25]},{18:[2,32],33:[2,32]},{34:[1,57]},{21:61,28:[1,62],29:[1,63],30:[1,64],33:[1,25],35:24},{18:[2,39],28:[2,39],29:[2,39],30:[2,39],33:[2,39],36:[2,39]},{5:[2,19],14:[2,19],15:[2,19],16:[2,19],19:[2,19],20:[2,19],22:[2,19],23:[2,19],24:[2,19]},{5:[2,15],14:[2,15],15:[2,15],16:[2,15],19:[2,15],20:[2,15],22:[2,15],23:[2,15],24:[2,15]},{18:[2,34],33:[2,34]},{18:[2,35],33:[2,35]},{18:[2,36],33:[2,36]},{18:[2,37],33:[2,37]}],
defaultActions: {16:[2,1],37:[2,23],53:[2,21]},
parseError: function parseError(str, hash) {
    throw new Error(str);
},
parse: function parse(input) {
    var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    this.lexer.setInput(input);
    this.lexer.yy = this.yy;
    this.yy.lexer = this.lexer;
    if (typeof this.lexer.yylloc == "undefined")
        this.lexer.yylloc = {};
    var yyloc = this.lexer.yylloc;
    lstack.push(yyloc);
    if (typeof this.yy.parseError === "function")
        this.parseError = this.yy.parseError;
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    function lex() {
        var token;
        token = self.lexer.lex() || 1;
        if (typeof token !== "number") {
            token = self.symbols_[token] || token;
        }
        return token;
    }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol == null)
                symbol = lex();
            action = table[state] && table[state][symbol];
        }
        if (typeof action === "undefined" || !action.length || !action[0]) {
            if (!recovering) {
                expected = [];
                for (p in table[state])
                    if (this.terminals_[p] && p > 2) {
                        expected.push("'" + this.terminals_[p] + "'");
                    }
                var errStr = "";
                if (this.lexer.showPosition) {
                    errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + this.terminals_[symbol] + "'";
                } else {
                    errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1?"end of input":"'" + (this.terminals_[symbol] || symbol) + "'");
                }
                this.parseError(errStr, {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
            }
        }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(this.lexer.yytext);
            lstack.push(this.lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                if (recovering > 0)
                    recovering--;
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {first_line: lstack[lstack.length - (len || 1)].first_line, last_line: lstack[lstack.length - 1].last_line, first_column: lstack[lstack.length - (len || 1)].first_column, last_column: lstack[lstack.length - 1].last_column};
            r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
            if (typeof r !== "undefined") {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}
};/* Jison generated lexer */
var lexer = (function(){

var lexer = ({EOF:1,
parseError:function parseError(str, hash) {
        if (this.yy.parseError) {
            this.yy.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },
setInput:function (input) {
        this._input = input;
        this._more = this._less = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
        return this;
    },
input:function () {
        var ch = this._input[0];
        this.yytext+=ch;
        this.yyleng++;
        this.match+=ch;
        this.matched+=ch;
        var lines = ch.match(/\n/);
        if (lines) this.yylineno++;
        this._input = this._input.slice(1);
        return ch;
    },
unput:function (ch) {
        this._input = ch + this._input;
        return this;
    },
more:function () {
        this._more = true;
        return this;
    },
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
    },
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c+"^";
    },
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) this.done = true;

        var token,
            match,
            col,
            lines;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i=0;i < rules.length; i++) {
            match = this._input.match(this.rules[rules[i]]);
            if (match) {
                lines = match[0].match(/\n.*/g);
                if (lines) this.yylineno += lines.length;
                this.yylloc = {first_line: this.yylloc.last_line,
                               last_line: this.yylineno+1,
                               first_column: this.yylloc.last_column,
                               last_column: lines ? lines[lines.length-1].length-1 : this.yylloc.last_column + match[0].length}
                this.yytext += match[0];
                this.match += match[0];
                this.matches = match;
                this.yyleng = this.yytext.length;
                this._more = false;
                this._input = this._input.slice(match[0].length);
                this.matched += match[0];
                token = this.performAction.call(this, this.yy, this, rules[i],this.conditionStack[this.conditionStack.length-1]);
                if (token) return token;
                else return;
            }
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(), 
                    {text: "", token: null, line: this.yylineno});
        }
    },
lex:function lex() {
        var r = this.next();
        if (typeof r !== 'undefined') {
            return r;
        } else {
            return this.lex();
        }
    },
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },
popState:function popState() {
        return this.conditionStack.pop();
    },
_currentRules:function _currentRules() {
        return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
    },
topState:function () {
        return this.conditionStack[this.conditionStack.length-2];
    },
pushState:function begin(condition) {
        this.begin(condition);
    }});
lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {

var YYSTATE=YY_START
switch($avoiding_name_collisions) {
case 0:
                                   if(yy_.yytext.slice(-1) !== "\\") this.begin("mu");
                                   if(yy_.yytext.slice(-1) === "\\") yy_.yytext = yy_.yytext.substr(0,yy_.yyleng-1), this.begin("emu");
                                   if(yy_.yytext) return 14;
                                 
break;
case 1: return 14; 
break;
case 2: this.popState(); return 14; 
break;
case 3: return 24; 
break;
case 4: return 16; 
break;
case 5: return 20; 
break;
case 6: return 19; 
break;
case 7: return 19; 
break;
case 8: return 23; 
break;
case 9: return 23; 
break;
case 10: yy_.yytext = yy_.yytext.substr(3,yy_.yyleng-5); this.popState(); return 15; 
break;
case 11: return 22; 
break;
case 12: return 34; 
break;
case 13: return 33; 
break;
case 14: return 33; 
break;
case 15: return 36; 
break;
case 16: /*ignore whitespace*/ 
break;
case 17: this.popState(); return 18; 
break;
case 18: this.popState(); return 18; 
break;
case 19: yy_.yytext = yy_.yytext.substr(1,yy_.yyleng-2).replace(/\\"/g,'"'); return 28; 
break;
case 20: return 30; 
break;
case 21: return 30; 
break;
case 22: return 29; 
break;
case 23: return 33; 
break;
case 24: yy_.yytext = yy_.yytext.substr(1, yy_.yyleng-2); return 33; 
break;
case 25: return 'INVALID'; 
break;
case 26: return 5; 
break;
}
};
lexer.rules = [/^[^\x00]*?(?=(\{\{))/,/^[^\x00]+/,/^[^\x00]{2,}?(?=(\{\{))/,/^\{\{>/,/^\{\{#/,/^\{\{\//,/^\{\{\^/,/^\{\{\s*else\b/,/^\{\{\{/,/^\{\{&/,/^\{\{![\s\S]*?\}\}/,/^\{\{/,/^=/,/^\.(?=[} ])/,/^\.\./,/^[\/.]/,/^\s+/,/^\}\}\}/,/^\}\}/,/^"(\\["]|[^"])*"/,/^true(?=[}\s])/,/^false(?=[}\s])/,/^[0-9]+(?=[}\s])/,/^[a-zA-Z0-9_$-]+(?=[=}\s\/.])/,/^\[[^\]]*\]/,/^./,/^$/];
lexer.conditions = {"mu":{"rules":[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26],"inclusive":false},"emu":{"rules":[2],"inclusive":false},"INITIAL":{"rules":[0,1,26],"inclusive":true}};return lexer;})()
parser.lexer = lexer;
return parser;
})();
if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = handlebars;
exports.parse = function () { return handlebars.parse.apply(handlebars, arguments); }
exports.main = function commonjsMain(args) {
    if (!args[1])
        throw new Error('Usage: '+args[0]+' FILE');
    if (typeof process !== 'undefined') {
        var source = require('fs').readFileSync(require('path').join(process.cwd(), args[1]), "utf8");
    } else {
        var cwd = require("file").path(require("file").cwd());
        var source = cwd.join(args[1]).read({charset: "utf-8"});
    }
    return exports.parser.parse(source);
}
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(typeof process !== 'undefined' ? process.argv.slice(1) : require("system").args);
}
};
;
// lib/handlebars/compiler/base.js
Handlebars.Parser = handlebars;

Handlebars.parse = function(string) {
  Handlebars.Parser.yy = Handlebars.AST;
  return Handlebars.Parser.parse(string);
};

Handlebars.print = function(ast) {
  return new Handlebars.PrintVisitor().accept(ast);
};

Handlebars.logger = {
  DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, level: 3,

  // override in the host environment
  log: function(level, str) {}
};

Handlebars.log = function(level, str) { Handlebars.logger.log(level, str); };
;
// lib/handlebars/compiler/ast.js
(function() {

  Handlebars.AST = {};

  Handlebars.AST.ProgramNode = function(statements, inverse) {
    this.type = "program";
    this.statements = statements;
    if(inverse) { this.inverse = new Handlebars.AST.ProgramNode(inverse); }
  };

  Handlebars.AST.MustacheNode = function(params, hash, unescaped) {
    this.type = "mustache";
    this.id = params[0];
    this.params = params.slice(1);
    this.hash = hash;
    this.escaped = !unescaped;
  };

  Handlebars.AST.PartialNode = function(id, context) {
    this.type    = "partial";

    // TODO: disallow complex IDs

    this.id      = id;
    this.context = context;
  };

  var verifyMatch = function(open, close) {
    if(open.original !== close.original) {
      throw new Handlebars.Exception(open.original + " doesn't match " + close.original);
    }
  };

  Handlebars.AST.BlockNode = function(mustache, program, close) {
    verifyMatch(mustache.id, close);
    this.type = "block";
    this.mustache = mustache;
    this.program  = program;
  };

  Handlebars.AST.InverseNode = function(mustache, program, close) {
    verifyMatch(mustache.id, close);
    this.type = "inverse";
    this.mustache = mustache;
    this.program  = program;
  };

  Handlebars.AST.ContentNode = function(string) {
    this.type = "content";
    this.string = string;
  };

  Handlebars.AST.HashNode = function(pairs) {
    this.type = "hash";
    this.pairs = pairs;
  };

  Handlebars.AST.IdNode = function(parts) {
    this.type = "ID";
    this.original = parts.join(".");

    var dig = [], depth = 0;

    for(var i=0,l=parts.length; i<l; i++) {
      var part = parts[i];

      if(part === "..") { depth++; }
      else if(part === "." || part === "this") { this.isScoped = true; }
      else { dig.push(part); }
    }

    this.parts    = dig;
    this.string   = dig.join('.');
    this.depth    = depth;
    this.isSimple = (dig.length === 1) && (depth === 0);
  };

  Handlebars.AST.StringNode = function(string) {
    this.type = "STRING";
    this.string = string;
  };

  Handlebars.AST.IntegerNode = function(integer) {
    this.type = "INTEGER";
    this.integer = integer;
  };

  Handlebars.AST.BooleanNode = function(bool) {
    this.type = "BOOLEAN";
    this.bool = bool;
  };

  Handlebars.AST.CommentNode = function(comment) {
    this.type = "comment";
    this.comment = comment;
  };

})();;
// lib/handlebars/utils.js
Handlebars.Exception = function(message) {
  var tmp = Error.prototype.constructor.apply(this, arguments);

  for (var p in tmp) {
    if (tmp.hasOwnProperty(p)) { this[p] = tmp[p]; }
  }

  this.message = tmp.message;
};
Handlebars.Exception.prototype = new Error;

// Build out our basic SafeString type
Handlebars.SafeString = function(string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function() {
  return this.string.toString();
};

(function() {
  var escape = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;"
  };

  var badChars = /&(?!\w+;)|[<>"'`]/g;
  var possible = /[&<>"'`]/;

  var escapeChar = function(chr) {
    return escape[chr] || "&amp;";
  };

  Handlebars.Utils = {
    escapeExpression: function(string) {
      // don't escape SafeStrings, since they're already safe
      if (string instanceof Handlebars.SafeString) {
        return string.toString();
      } else if (string == null || string === false) {
        return "";
      }

      if(!possible.test(string)) { return string; }
      return string.replace(badChars, escapeChar);
    },

    isEmpty: function(value) {
      if (typeof value === "undefined") {
        return true;
      } else if (value === null) {
        return true;
      } else if (value === false) {
        return true;
      } else if(Object.prototype.toString.call(value) === "[object Array]" && value.length === 0) {
        return true;
      } else {
        return false;
      }
    }
  };
})();;
// lib/handlebars/compiler/compiler.js
Handlebars.Compiler = function() {};
Handlebars.JavaScriptCompiler = function() {};

(function(Compiler, JavaScriptCompiler) {
  Compiler.OPCODE_MAP = {
    appendContent: 1,
    getContext: 2,
    lookupWithHelpers: 3,
    lookup: 4,
    append: 5,
    invokeMustache: 6,
    appendEscaped: 7,
    pushString: 8,
    truthyOrFallback: 9,
    functionOrFallback: 10,
    invokeProgram: 11,
    invokePartial: 12,
    push: 13,
    assignToHash: 15,
    pushStringParam: 16
  };

  Compiler.MULTI_PARAM_OPCODES = {
    appendContent: 1,
    getContext: 1,
    lookupWithHelpers: 2,
    lookup: 1,
    invokeMustache: 3,
    pushString: 1,
    truthyOrFallback: 1,
    functionOrFallback: 1,
    invokeProgram: 3,
    invokePartial: 1,
    push: 1,
    assignToHash: 1,
    pushStringParam: 1
  };

  Compiler.DISASSEMBLE_MAP = {};

  for(var prop in Compiler.OPCODE_MAP) {
    var value = Compiler.OPCODE_MAP[prop];
    Compiler.DISASSEMBLE_MAP[value] = prop;
  }

  Compiler.multiParamSize = function(code) {
    return Compiler.MULTI_PARAM_OPCODES[Compiler.DISASSEMBLE_MAP[code]];
  };

  Compiler.prototype = {
    compiler: Compiler,

    disassemble: function() {
      var opcodes = this.opcodes, opcode, nextCode;
      var out = [], str, name, value;

      for(var i=0, l=opcodes.length; i<l; i++) {
        opcode = opcodes[i];

        if(opcode === 'DECLARE') {
          name = opcodes[++i];
          value = opcodes[++i];
          out.push("DECLARE " + name + " = " + value);
        } else {
          str = Compiler.DISASSEMBLE_MAP[opcode];

          var extraParams = Compiler.multiParamSize(opcode);
          var codes = [];

          for(var j=0; j<extraParams; j++) {
            nextCode = opcodes[++i];

            if(typeof nextCode === "string") {
              nextCode = "\"" + nextCode.replace("\n", "\\n") + "\"";
            }

            codes.push(nextCode);
          }

          str = str + " " + codes.join(" ");

          out.push(str);
        }
      }

      return out.join("\n");
    },

    guid: 0,

    compile: function(program, options) {
      this.children = [];
      this.depths = {list: []};
      this.options = options;

      // These changes will propagate to the other compiler components
      var knownHelpers = this.options.knownHelpers;
      this.options.knownHelpers = {
        'helperMissing': true,
        'blockHelperMissing': true,
        'each': true,
        'if': true,
        'unless': true,
        'with': true,
        'log': true
      };
      if (knownHelpers) {
        for (var name in knownHelpers) {
          this.options.knownHelpers[name] = knownHelpers[name];
        }
      }

      return this.program(program);
    },

    accept: function(node) {
      return this[node.type](node);
    },

    program: function(program) {
      var statements = program.statements, statement;
      this.opcodes = [];

      for(var i=0, l=statements.length; i<l; i++) {
        statement = statements[i];
        this[statement.type](statement);
      }
      this.isSimple = l === 1;

      this.depths.list = this.depths.list.sort(function(a, b) {
        return a - b;
      });

      return this;
    },

    compileProgram: function(program) {
      var result = new this.compiler().compile(program, this.options);
      var guid = this.guid++;

      this.usePartial = this.usePartial || result.usePartial;

      this.children[guid] = result;

      for(var i=0, l=result.depths.list.length; i<l; i++) {
        depth = result.depths.list[i];

        if(depth < 2) { continue; }
        else { this.addDepth(depth - 1); }
      }

      return guid;
    },

    block: function(block) {
      var mustache = block.mustache;
      var depth, child, inverse, inverseGuid;

      var params = this.setupStackForMustache(mustache);

      var programGuid = this.compileProgram(block.program);

      if(block.program.inverse) {
        inverseGuid = this.compileProgram(block.program.inverse);
        this.declare('inverse', inverseGuid);
      }

      this.opcode('invokeProgram', programGuid, params.length, !!mustache.hash);
      this.declare('inverse', null);
      this.opcode('append');
    },

    inverse: function(block) {
      var params = this.setupStackForMustache(block.mustache);

      var programGuid = this.compileProgram(block.program);

      this.declare('inverse', programGuid);

      this.opcode('invokeProgram', null, params.length, !!block.mustache.hash);
      this.declare('inverse', null);
      this.opcode('append');
    },

    hash: function(hash) {
      var pairs = hash.pairs, pair, val;

      this.opcode('push', '{}');

      for(var i=0, l=pairs.length; i<l; i++) {
        pair = pairs[i];
        val  = pair[1];

        this.accept(val);
        this.opcode('assignToHash', pair[0]);
      }
    },

    partial: function(partial) {
      var id = partial.id;
      this.usePartial = true;

      if(partial.context) {
        this.ID(partial.context);
      } else {
        this.opcode('push', 'depth0');
      }

      this.opcode('invokePartial', id.original);
      this.opcode('append');
    },

    content: function(content) {
      this.opcode('appendContent', content.string);
    },

    mustache: function(mustache) {
      var params = this.setupStackForMustache(mustache);

      this.opcode('invokeMustache', params.length, mustache.id.original, !!mustache.hash);

      if(mustache.escaped && !this.options.noEscape) {
        this.opcode('appendEscaped');
      } else {
        this.opcode('append');
      }
    },

    ID: function(id) {
      this.addDepth(id.depth);

      this.opcode('getContext', id.depth);

      this.opcode('lookupWithHelpers', id.parts[0] || null, id.isScoped || false);

      for(var i=1, l=id.parts.length; i<l; i++) {
        this.opcode('lookup', id.parts[i]);
      }
    },

    STRING: function(string) {
      this.opcode('pushString', string.string);
    },

    INTEGER: function(integer) {
      this.opcode('push', integer.integer);
    },

    BOOLEAN: function(bool) {
      this.opcode('push', bool.bool);
    },

    comment: function() {},

    // HELPERS
    pushParams: function(params) {
      var i = params.length, param;

      while(i--) {
        param = params[i];

        if(this.options.stringParams) {
          if(param.depth) {
            this.addDepth(param.depth);
          }

          this.opcode('getContext', param.depth || 0);
          this.opcode('pushStringParam', param.string);
        } else {
          this[param.type](param);
        }
      }
    },

    opcode: function(name, val1, val2, val3) {
      this.opcodes.push(Compiler.OPCODE_MAP[name]);
      if(val1 !== undefined) { this.opcodes.push(val1); }
      if(val2 !== undefined) { this.opcodes.push(val2); }
      if(val3 !== undefined) { this.opcodes.push(val3); }
    },

    declare: function(name, value) {
      this.opcodes.push('DECLARE');
      this.opcodes.push(name);
      this.opcodes.push(value);
    },

    addDepth: function(depth) {
      if(depth === 0) { return; }

      if(!this.depths[depth]) {
        this.depths[depth] = true;
        this.depths.list.push(depth);
      }
    },

    setupStackForMustache: function(mustache) {
      var params = mustache.params;

      this.pushParams(params);

      if(mustache.hash) {
        this.hash(mustache.hash);
      }

      this.ID(mustache.id);

      return params;
    }
  };

  JavaScriptCompiler.prototype = {
    // PUBLIC API: You can override these methods in a subclass to provide
    // alternative compiled forms for name lookup and buffering semantics
    nameLookup: function(parent, name, type) {
			if (/^[0-9]+$/.test(name)) {
        return parent + "[" + name + "]";
      } else if (JavaScriptCompiler.isValidJavaScriptVariableName(name)) {
	    	return parent + "." + name;
			}
			else {
				return parent + "['" + name + "']";
      }
    },

    appendToBuffer: function(string) {
      if (this.environment.isSimple) {
        return "return " + string + ";";
      } else {
        return "buffer += " + string + ";";
      }
    },

    initializeBuffer: function() {
      return this.quotedString("");
    },

    namespace: "Handlebars",
    // END PUBLIC API

    compile: function(environment, options, context, asObject) {
      this.environment = environment;
      this.options = options || {};

      this.name = this.environment.name;
      this.isChild = !!context;
      this.context = context || {
        programs: [],
        aliases: { self: 'this' },
        registers: {list: []}
      };

      this.preamble();

      this.stackSlot = 0;
      this.stackVars = [];

      this.compileChildren(environment, options);

      var opcodes = environment.opcodes, opcode;

      this.i = 0;

      for(l=opcodes.length; this.i<l; this.i++) {
        opcode = this.nextOpcode(0);

        if(opcode[0] === 'DECLARE') {
          this.i = this.i + 2;
          this[opcode[1]] = opcode[2];
        } else {
          this.i = this.i + opcode[1].length;
          this[opcode[0]].apply(this, opcode[1]);
        }
      }

      return this.createFunctionContext(asObject);
    },

    nextOpcode: function(n) {
      var opcodes = this.environment.opcodes, opcode = opcodes[this.i + n], name, val;
      var extraParams, codes;

      if(opcode === 'DECLARE') {
        name = opcodes[this.i + 1];
        val  = opcodes[this.i + 2];
        return ['DECLARE', name, val];
      } else {
        name = Compiler.DISASSEMBLE_MAP[opcode];

        extraParams = Compiler.multiParamSize(opcode);
        codes = [];

        for(var j=0; j<extraParams; j++) {
          codes.push(opcodes[this.i + j + 1 + n]);
        }

        return [name, codes];
      }
    },

    eat: function(opcode) {
      this.i = this.i + opcode.length;
    },

    preamble: function() {
      var out = [];

      // this register will disambiguate helper lookup from finding a function in
      // a context. This is necessary for mustache compatibility, which requires
      // that context functions in blocks are evaluated by blockHelperMissing, and
      // then proceed as if the resulting value was provided to blockHelperMissing.
      this.useRegister('foundHelper');

      if (!this.isChild) {
        var namespace = this.namespace;
        var copies = "helpers = helpers || " + namespace + ".helpers;";
        if(this.environment.usePartial) { copies = copies + " partials = partials || " + namespace + ".partials;"; }
        out.push(copies);
      } else {
        out.push('');
      }

      if (!this.environment.isSimple) {
        out.push(", buffer = " + this.initializeBuffer());
      } else {
        out.push("");
      }

      // track the last context pushed into place to allow skipping the
      // getContext opcode when it would be a noop
      this.lastContext = 0;
      this.source = out;
    },

    createFunctionContext: function(asObject) {
      var locals = this.stackVars;
      if (!this.isChild) {
        locals = locals.concat(this.context.registers.list);
      }

      if(locals.length > 0) {
        this.source[1] = this.source[1] + ", " + locals.join(", ");
      }

      // Generate minimizer alias mappings
      if (!this.isChild) {
        var aliases = []
        for (var alias in this.context.aliases) {
          this.source[1] = this.source[1] + ', ' + alias + '=' + this.context.aliases[alias];
        }
      }

      if (this.source[1]) {
        this.source[1] = "var " + this.source[1].substring(2) + ";";
      }

      // Merge children
      if (!this.isChild) {
        this.source[1] += '\n' + this.context.programs.join('\n') + '\n';
      }

      if (!this.environment.isSimple) {
        this.source.push("return buffer;");
      }

      var params = this.isChild ? ["depth0", "data"] : ["Handlebars", "depth0", "helpers", "partials", "data"];

      for(var i=0, l=this.environment.depths.list.length; i<l; i++) {
        params.push("depth" + this.environment.depths.list[i]);
      }

      if (asObject) {
        params.push(this.source.join("\n  "));

        return Function.apply(this, params);
      } else {
        var functionSource = 'function ' + (this.name || '') + '(' + params.join(',') + ') {\n  ' + this.source.join("\n  ") + '}';
        Handlebars.log(Handlebars.logger.DEBUG, functionSource + "\n\n");
        return functionSource;
      }
    },

    appendContent: function(content) {
      this.source.push(this.appendToBuffer(this.quotedString(content)));
    },

    append: function() {
      var local = this.popStack();
      this.source.push("if(" + local + " || " + local + " === 0) { " + this.appendToBuffer(local) + " }");
      if (this.environment.isSimple) {
        this.source.push("else { " + this.appendToBuffer("''") + " }");
      }
    },

    appendEscaped: function() {
      var opcode = this.nextOpcode(1), extra = "";
      this.context.aliases.escapeExpression = 'this.escapeExpression';

      if(opcode[0] === 'appendContent') {
        extra = " + " + this.quotedString(opcode[1][0]);
        this.eat(opcode);
      }

      this.source.push(this.appendToBuffer("escapeExpression(" + this.popStack() + ")" + extra));
    },

    getContext: function(depth) {
      if(this.lastContext !== depth) {
        this.lastContext = depth;
      }
    },

    lookupWithHelpers: function(name, isScoped) {
      if(name) {
        var topStack = this.nextStack();

        this.usingKnownHelper = false;

        var toPush;
        if (!isScoped && this.options.knownHelpers[name]) {
          toPush = topStack + " = " + this.nameLookup('helpers', name, 'helper');
          this.usingKnownHelper = true;
        } else if (isScoped || this.options.knownHelpersOnly) {
          toPush = topStack + " = " + this.nameLookup('depth' + this.lastContext, name, 'context');
        } else {
          this.register('foundHelper', this.nameLookup('helpers', name, 'helper'));
          toPush = topStack + " = foundHelper || " + this.nameLookup('depth' + this.lastContext, name, 'context');
        }

        toPush += ';';
        this.source.push(toPush);
      } else {
        this.pushStack('depth' + this.lastContext);
      }
    },

    lookup: function(name) {
      var topStack = this.topStack();
      this.source.push(topStack + " = (" + topStack + " === null || " + topStack + " === undefined || " + topStack + " === false ? " +
 				topStack + " : " + this.nameLookup(topStack, name, 'context') + ");");
    },

    pushStringParam: function(string) {
      this.pushStack('depth' + this.lastContext);
      this.pushString(string);
    },

    pushString: function(string) {
      this.pushStack(this.quotedString(string));
    },

    push: function(name) {
      this.pushStack(name);
    },

    invokeMustache: function(paramSize, original, hasHash) {
      this.populateParams(paramSize, this.quotedString(original), "{}", null, hasHash, function(nextStack, helperMissingString, id) {
        if (!this.usingKnownHelper) {
          this.context.aliases.helperMissing = 'helpers.helperMissing';
          this.context.aliases.undef = 'void 0';
          this.source.push("else if(" + id + "=== undef) { " + nextStack + " = helperMissing.call(" + helperMissingString + "); }");
          if (nextStack !== id) {
            this.source.push("else { " + nextStack + " = " + id + "; }");
          }
        }
      });
    },

    invokeProgram: function(guid, paramSize, hasHash) {
      var inverse = this.programExpression(this.inverse);
      var mainProgram = this.programExpression(guid);

      this.populateParams(paramSize, null, mainProgram, inverse, hasHash, function(nextStack, helperMissingString, id) {
        if (!this.usingKnownHelper) {
          this.context.aliases.blockHelperMissing = 'helpers.blockHelperMissing';
          this.source.push("else { " + nextStack + " = blockHelperMissing.call(" + helperMissingString + "); }");
        }
      });
    },

    populateParams: function(paramSize, helperId, program, inverse, hasHash, fn) {
      var needsRegister = hasHash || this.options.stringParams || inverse || this.options.data;
      var id = this.popStack(), nextStack;
      var params = [], param, stringParam, stringOptions;

      if (needsRegister) {
        this.register('tmp1', program);
        stringOptions = 'tmp1';
      } else {
        stringOptions = '{ hash: {} }';
      }

      if (needsRegister) {
        var hash = (hasHash ? this.popStack() : '{}');
        this.source.push('tmp1.hash = ' + hash + ';');
      }

      if(this.options.stringParams) {
        this.source.push('tmp1.contexts = [];');
      }

      for(var i=0; i<paramSize; i++) {
        param = this.popStack();
        params.push(param);

        if(this.options.stringParams) {
          this.source.push('tmp1.contexts.push(' + this.popStack() + ');');
        }
      }

      if(inverse) {
        this.source.push('tmp1.fn = tmp1;');
        this.source.push('tmp1.inverse = ' + inverse + ';');
      }

      if(this.options.data) {
        this.source.push('tmp1.data = data;');
      }

      params.push(stringOptions);

      this.populateCall(params, id, helperId || id, fn, program !== '{}');
    },

    populateCall: function(params, id, helperId, fn, program) {
      var paramString = ["depth0"].concat(params).join(", ");
      var helperMissingString = ["depth0"].concat(helperId).concat(params).join(", ");

      var nextStack = this.nextStack();

      if (this.usingKnownHelper) {
        this.source.push(nextStack + " = " + id + ".call(" + paramString + ");");
      } else {
        this.context.aliases.functionType = '"function"';
        var condition = program ? "foundHelper && " : ""
        this.source.push("if(" + condition + "typeof " + id + " === functionType) { " + nextStack + " = " + id + ".call(" + paramString + "); }");
      }
      fn.call(this, nextStack, helperMissingString, id);
      this.usingKnownHelper = false;
    },

    invokePartial: function(context) {
      params = [this.nameLookup('partials', context, 'partial'), "'" + context + "'", this.popStack(), "helpers", "partials"];

      if (this.options.data) {
        params.push("data");
      }

      this.pushStack("self.invokePartial(" + params.join(", ") + ");");
    },

    assignToHash: function(key) {
      var value = this.popStack();
      var hash = this.topStack();

      this.source.push(hash + "['" + key + "'] = " + value + ";");
    },

    // HELPERS

    compiler: JavaScriptCompiler,

    compileChildren: function(environment, options) {
      var children = environment.children, child, compiler;

      for(var i=0, l=children.length; i<l; i++) {
        child = children[i];
        compiler = new this.compiler();

        this.context.programs.push('');     // Placeholder to prevent name conflicts for nested children
        var index = this.context.programs.length;
        child.index = index;
        child.name = 'program' + index;
        this.context.programs[index] = compiler.compile(child, options, this.context);
      }
    },

    programExpression: function(guid) {
      if(guid == null) { return "self.noop"; }

      var child = this.environment.children[guid],
          depths = child.depths.list;
      var programParams = [child.index, child.name, "data"];

      for(var i=0, l = depths.length; i<l; i++) {
        depth = depths[i];

        if(depth === 1) { programParams.push("depth0"); }
        else { programParams.push("depth" + (depth - 1)); }
      }

      if(depths.length === 0) {
        return "self.program(" + programParams.join(", ") + ")";
      } else {
        programParams.shift();
        return "self.programWithDepth(" + programParams.join(", ") + ")";
      }
    },

    register: function(name, val) {
      this.useRegister(name);
      this.source.push(name + " = " + val + ";");
    },

    useRegister: function(name) {
      if(!this.context.registers[name]) {
        this.context.registers[name] = true;
        this.context.registers.list.push(name);
      }
    },

    pushStack: function(item) {
      this.source.push(this.nextStack() + " = " + item + ";");
      return "stack" + this.stackSlot;
    },

    nextStack: function() {
      this.stackSlot++;
      if(this.stackSlot > this.stackVars.length) { this.stackVars.push("stack" + this.stackSlot); }
      return "stack" + this.stackSlot;
    },

    popStack: function() {
      return "stack" + this.stackSlot--;
    },

    topStack: function() {
      return "stack" + this.stackSlot;
    },

    quotedString: function(str) {
      return '"' + str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r') + '"';
    }
  };

  var reservedWords = (
    "break else new var" +
    " case finally return void" +
    " catch for switch while" +
    " continue function this with" +
    " default if throw" +
    " delete in try" +
    " do instanceof typeof" +
    " abstract enum int short" +
    " boolean export interface static" +
    " byte extends long super" +
    " char final native synchronized" +
    " class float package throws" +
    " const goto private transient" +
    " debugger implements protected volatile" +
    " double import public let yield"
  ).split(" ");

  var compilerWords = JavaScriptCompiler.RESERVED_WORDS = {};

  for(var i=0, l=reservedWords.length; i<l; i++) {
    compilerWords[reservedWords[i]] = true;
  }

	JavaScriptCompiler.isValidJavaScriptVariableName = function(name) {
		if(!JavaScriptCompiler.RESERVED_WORDS[name] && /^[a-zA-Z_$][0-9a-zA-Z_$]+$/.test(name)) {
			return true;
		}
		return false;
	}

})(Handlebars.Compiler, Handlebars.JavaScriptCompiler);

Handlebars.precompile = function(string, options) {
  options = options || {};

  var ast = Handlebars.parse(string);
  var environment = new Handlebars.Compiler().compile(ast, options);
  return new Handlebars.JavaScriptCompiler().compile(environment, options);
};

Handlebars.compile = function(string, options) {
  options = options || {};

  var compiled;
  function compile() {
    var ast = Handlebars.parse(string);
    var environment = new Handlebars.Compiler().compile(ast, options);
    var templateSpec = new Handlebars.JavaScriptCompiler().compile(environment, options, undefined, true);
    return Handlebars.template(templateSpec);
  }

  // Template is only compiled on first use and cached after that point.
  return function(context, options) {
    if (!compiled) {
      compiled = compile();
    }
    return compiled.call(this, context, options);
  };
};
;
// lib/handlebars/runtime.js
Handlebars.VM = {
  template: function(templateSpec) {
    // Just add water
    var container = {
      escapeExpression: Handlebars.Utils.escapeExpression,
      invokePartial: Handlebars.VM.invokePartial,
      programs: [],
      program: function(i, fn, data) {
        var programWrapper = this.programs[i];
        if(data) {
          return Handlebars.VM.program(fn, data);
        } else if(programWrapper) {
          return programWrapper;
        } else {
          programWrapper = this.programs[i] = Handlebars.VM.program(fn);
          return programWrapper;
        }
      },
      programWithDepth: Handlebars.VM.programWithDepth,
      noop: Handlebars.VM.noop
    };

    return function(context, options) {
      options = options || {};
      return templateSpec.call(container, Handlebars, context, options.helpers, options.partials, options.data);
    };
  },

  programWithDepth: function(fn, data, $depth) {
    var args = Array.prototype.slice.call(arguments, 2);

    return function(context, options) {
      options = options || {};

      return fn.apply(this, [context, options.data || data].concat(args));
    };
  },
  program: function(fn, data) {
    return function(context, options) {
      options = options || {};

      return fn(context, options.data || data);
    };
  },
  noop: function() { return ""; },
  invokePartial: function(partial, name, context, helpers, partials, data) {
    options = { helpers: helpers, partials: partials, data: data };

    if(partial === undefined) {
      throw new Handlebars.Exception("The partial " + name + " could not be found");
    } else if(partial instanceof Function) {
      return partial(context, options);
    } else if (!Handlebars.compile) {
      throw new Handlebars.Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    } else {
      partials[name] = Handlebars.compile(partial);
      return partials[name](context, options);
    }
  }
};

Handlebars.template = Handlebars.VM.template;
;

define("handlebars", function(){});

/*global Handlebars*/

define('tmpl',["handlebars", "text"], function (hb, text) {
    var buildMap = {};
    return {
        load:   function (name, req, onLoad, config) {
            return text.load(name, req, function (content) {
                if (config.isBuild && config.inlineText) buildMap[name] = content;
                onLoad(config.isBuild ? content : Handlebars.compile(content));
            }, config);
        }
    ,   write:  function (pluginName, moduleName, write) {
            if (moduleName in buildMap) {
                var content = text.jsEscape(buildMap[moduleName]);
                write("define('" + pluginName + "!" + moduleName  +
                      "', ['handlebars'], function (hb) { return Handlebars.compile('" + content + "');});\n");
            }
        }
    };
});


define('tmpl!pcisig/templates/headers.handlebars', ['handlebars'], function (hb) { return Handlebars.compile('<div class="head">\n{{#if logos}}\n    {{showLogos logos}}\n{{else}}\n    {{#if prependPCIeLogo}}\n    <p>\n        <a href="https://www.pcisig.com/">\n            <img width="210" height="80" alt="PCI Express Logo"\n                 src="https://sglaser.github.io/respec/stylesheets/pcisig/pci_express_PMS.svg"/>\n        </a>\n    </p>\n    {{/if}}\n    {{#if prependPCISIGLogo}}\n    <p>\n        <a href="https://www.pcisig.com/">\n            <img width="210" height="108" alt="PCISIG Logo"\n                 src="https://sglaser.github.io/respec/stylesheets/pcisig/pci_sig_logo_PMS_273.svg"/>\n        </a>\n    </p>\n    {{/if}}\n{{/if}}\n<div id="respec-banner">\n    <span id="respec-banner-status">{{specStatusLong}}</span>&nbsp;&mdash;&nbsp;\n    {{#if specReviewLong}}\n        <span id="respec-banner-next-state">{{specReviewLong}}</span>&nbsp;&mdash;&nbsp;\n    {{/if}}\n    {{#if specLevelLong}}\n        <span id="respec-banner-maturity">{{specLevelLong}}</span>&nbsp;&mdash;&nbsp;\n    {{/if}}\n    <span id="respec-banner-spec-name">{{title}}</span>&nbsp;&nbsp;&nbsp;\n</div>\n<h1 class="title p-name" id="title"{{#if doRDFa}} property="dcterms:title"{{/if}}>{{title}}</h1>\n{{#if subtitle}}\n    <h2 {{#if doRDFa}}property="bibo:subtitle" {{/if}}id="subtitle" class="nolink">{{subtitle}}</h2>\n{{/if}}\n<h2 {{#if doRDFa}}property="dcterms:issued" datatype="xsd:dateTime"\ncontent="{{publishISODate}}"{{/if}} class="nolink">\n<time class="dt-published" datetime="{{dashDate}}">{{publishHumanDate}}</time>\n</h2>\n<dl>\n    {{#unless isNoTrack}}\n    <dt>This version:</dt>\n        <dd>{{#if thisVersion}}<a class="u-url" href="{{thisVersion}}">{{thisVersion}}</a>{{else}}none{{/if}}}</dd>\n    <dt>Latest published version:</dt>\n    <dd>{{#if latestVersion}}<a class="u.url" href="{{latestVersion}}">{{latestVersion}}</a>{{else}}none{{/if}}\n    </dd>\n    {{/unless}}\n    {{#if edDraftURI}}\n    <dt>Latest editor\'s draft:</dt>\n    <dd><a class="u-url" href="{{edDraftURI}}">{{edDraftURI}}</a></dd>\n    {{/if}}\n    {{#if testSuiteURI}}\n    <dt>Test suite:</dt>\n    <dd><a class="u-url" href="{{testSuiteURI}}">{{testSuiteURI}}</a></dd>\n    {{/if}}\n    {{#if implementationReportURI}}\n    <dt>Implementation report:</dt>\n    <dd><a class="u-url" href="{{implementationReportURI}}">{{implementationReportURI}}</a></dd>\n    {{/if}}\n    {{#if bugTrackerHTML}}\n    <dt>Bug tracker:</dt>\n    <dd>{{{bugTrackerHTML}}}</dd>\n    {{/if}}\n    {{#if isED}}\n    {{#if prevED}}\n    <dt>Previous editor\'s draft:</dt>\n    <dd><a class="u-url" href="{{prevED}}">{{prevED}}</a></dd>\n    {{/if}}\n    {{/if}}\n    {{#if showPreviousVersion}}\n    <dt>Previous version:</dt>\n    <dd><a {{#if doRDFa}}rel="dcterms:replaces"{{/if}}\n            class="u-url" href="{{prevVersion}}">{{prevVersion}}</a></dd>\n    {{/if}}\n    {{#if prevRecURI}}\n    {{#if isRec}}\n    <dt>Previous Recommendation:</dt>\n    <dd><a {{#if doRDFa}}rel="dcterms:replaces"{{/if}} href="{{prevRecURI}}">{{prevRecURI}}</a>\n    </dd>\n    {{else}}\n    <dt>Latest Recommendation:</dt>\n    <dd><a class="u-url" href="{{prevRecURI}}">{{prevRecURI}}</a></dd>\n    {{/if}}\n    {{/if}}\n    <dt>Editor{{#if multipleEditors}}s{{/if}}:</dt>\n    {{showPeople "Editor" editors}}\n    {{#if authors}}\n    <dt>Author{{#if multipleAuthors}}s{{/if}}:</dt>\n    {{showPeople "Author" authors}}\n    {{/if}}\n    {{#if otherLinks}}\n    {{#each otherLinks}}\n    {{#if key}}\n    <dt\n    {{#if class}}class="{{class}}"{{/if}}>{{key}}:</dt>\n    {{#if data}}\n    {{#each data}}\n    {{#if value}}\n    <dd\n    {{#if class}}class="{{class}}"{{/if}}>\n    {{#if href}}<a href="{{href}}">{{/if}}\n    {{value}}\n    {{#if href}}</a>{{/if}}\n    </dd>\n    {{else}}\n    {{#if href}}\n    <dd><a href="{{href}}">{{href}}</a></dd>\n    {{/if}}\n    {{/if}}\n    {{/each}}\n    {{else}}\n    {{#if value}}\n    <dd\n    {{#if class}}class="{{class}}"{{/if}}>\n    {{#if href}}<a href="{{href}}">{{/if}}\n    {{value}}\n    {{#if href}}</a>{{/if}}\n    </dd>\n    {{else}}\n    {{#if href}}\n    <dd\n    {{#if class}}class="{{class}}"{{/if}}>\n    <a href="{{href}}">{{href}}</a>\n    </dd>\n    {{/if}}\n    {{/if}}\n    {{/if}}\n    {{/if}}\n    {{/each}}\n    {{/if}}\n</dl>\n{{#if errata}}\n<p>\n    Please check the <a href="{{errata}}"><strong>errata</strong></a> for any errors or issues\n    reported since publication.\n</p>\n{{/if}}\n{{#if alternateFormats}}\n<p>\n    {{#if multipleAlternates}}\n    This document is also available in these non-normative formats:\n    {{else}}\n    This document is also available in this non-normative format:\n    {{/if}}\n    {{{alternatesHTML}}}\n</p>\n{{/if}}\n<blockquote>\n{{#if isUnofficial}}\n    {{#if additionalCopyrightHolders}}\n    <p class="copyright">{{{additionalCopyrightHolders}}}</p>\n    {{else}}\n        {{#if overrideCopyright}}\n        {{{overrideCopyright}}}\n        {{else}}\n        <p class="copyright">\n            This document is confidential and proprietary. All Rights Reserved.\n        </p>\n        {{/if}}\n    {{/if}}\n{{else}}\n    {{#if overrideCopyright}}\n        {{{overrideCopyright}}}\n    {{else}}\n        <p class="copyright">\n            Copyright &copy; {{#if copyrightStart}}{{copyrightStart}}-{{/if}}{{publishYear}} {{#if\n        additionalCopyrightHolders}} {{{additionalCopyrightHolders}}} &amp;{{/if}}\n            <a href="https://www.pcisig.com/">PCI-SIG</a>\n            <sup>&reg;</sup>\n        </p>\n        <p class="copyright">\n            PCI, PCI Express, PCIe, and PCI-SIG are trademarks or registered\n            trademarks of PCI-SIG.\n            All other product names are trademarks, registered trademarks,\n            or servicemarks of their respective owners.\n        </p>\n        {{#if isNoTrack}}\n            <p class="copyright">\n                PCI-SIG disclaims all warranties and liability for the use of\n                this document and the information contained herein and assumes\n                no responsibility for any errors that may appear in this\n                document, nor does PCI-SIG make a commitment to update the\n                information contained herein.\n            </p>\n        {{else}}\n            <p class="copyright">\n                Contact PCI-SIG Membership Services for questions about membership\n                in the PCI-SIG or to obtain the latest revision of this specification.\n                Contact PCI-SIG Technical Support for technical questions about this\n                specification.</p>\n            <dl class="copyright">\n                <dt>Membership Services</dt>\n                <dd><a href="mailto:administration@pcisig.com">administration@pcisig.com</a></dd>\n                <dd><a href="tel:+1-503-619-0569">+1-503-619-0569</a> (Phone)</dd>\n                <dd><a href="tel:+1-503-644-6708">+1-503-644-6708</a> (Fax)</dd>\n                <dt>Technical Support</dt>\n                <dd><a href="mailto:techsupp@pcisig.com">techsupp@pcisig.com</a></dd>\n            </dl>\n                <p class="copyright"><strong>DISCLAIMER</strong></p>\n                <p class="copyright">\n                    This Specification is provided “as is” with no warranties whatsoever,\n                    including any warranty of merchantability, noninfringement,\n                    fitness for any particular purpose, or any warranty otherwise arising\n                    out of any proposal, specification, or sample. PCI-SIG disclaims\n                    all liability for infringement of proprietary rights, relating to\n                    use of information in this specification. No license, express or\n                    implied, by estoppel or otherwise, to any intellectual property\n                    rights is granted herein.\n                    PCI-SIG assumes no responsibility for any errors that may\n                    appear in this document, nor does PCI-SIG make a commitment\n                    to update the information contained herein.</p>\n        {{/if}}\n    {{/if}}\n{{/if}}\n</blockquote>\n<hr/>\n</div>\n');});


define('tmpl!pcisig/templates/sotd.handlebars', ['handlebars'], function (hb) { return Handlebars.compile('<section id=\'sotd\' class=\'introductory\'><h2>Status of This Document</h2>\n    {{#if isUnofficial}}\n        <p>\n            This document is a working draft of a potential specification. It has\n            no official standing of any kind and does not represent the support or consensus of any\n            standards organisation.\n        </p>\n    {{else}}\n        {{#if isNoTrack}}\n            <p>\n                This document is a PCISIG internal document. It\n                has no official standing of any kind and does not represent consensus of the PCISIG\n                Membership.\n            </p>\n        {{else}}\n            {{#if isFinal}}\n                <p>\n                    This specification is an official publication of the PCISIG. The PCISIG\n                    may publish errata to this specification and may develop future revisions to this\n                    specification.\n                </p>\n            {{else}}\n                <p>\n                    This specification is intended to become a PCISIG Standard.\n                    This particular document is a <strong>{{specStatusLong}}</strong>\n                    {{#if specLevelLong}}\n                        of the <strong>{{specLevelLong}}</strong> document\n                        {{#if specReviewLong}}\n                            for <strong>{{specReviewLong}}</strong>\n                        {{/if}}\n                    {{/if}}.\n                    {{#if specReviewLong}}\n                        {{#if humanReviewEndDate}}\n                            The {{specReviewLong}} period ends 5:00 PM US Pacific Time on <b>{{humanReviewEndDate}}</b>.\n                        {{/if}}\n                    {{/if}}\n                </p>\n            {{/if}}\n        {{/if}}\n    {{/if}}\n    {{{sotdCustomParagraph}}}\n    {{#if wgPublicList}}\n        <p>If you wish to make comments regarding this document, please send them to\n            <a href=\'mailto:{{wgPublicList}}@pcisig.com{{#if subjectPrefix}}?subject={{subjectPrefix}}{{/if}}\'>{{wgPublicList}}\n                @pcisig.com</a>\n            {{#if subjectPrefix}}\n                with <code>{{subjectPrefix}}</code> at the start of your email\'s subject{{/if}}.\n        </p>\n    {{/if}}\n    {{#if addPatentNote}}<p>{{{addPatentNote}}}</p>{{/if}}\n</section>\n');});

/*jshint
    forin: false, laxcomma:true, jquery:true
*/
/*global Handlebars*/

/*global define, self, respecEvents, respecConfig */

// Module pcisig/headers
// Generate the headers material based on the provided configuration.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)
//  - editors: an array of people editing the document. People are defined using:
//          - name: the person's name (required)
//          - url: URI for the person's home page
//          - company: the person's company
//          - companyURL: the URI for the person's company
//          - mailto: the person's email
//          - note: a note on the person (e.g. former editor)
//  - authors: an array of people who are contributing authors of the document.
//  - subtitle: a subtitle for the specification
//  - publishDate: the date to use for the publication, default to document.lastModified, and
//      failing that to now. The format is YYYY-MM-DD or a Date object.
//  - previousPublishDate: the date on which the previous version was published.
//  - previousMaturity: the specStatus of the previous version
//  - errata: the URI of the errata document, if any
//  - alternateFormats: a list of alternate formats for the document, each of which being
//      defined by:
//          - uri: the URI to the alternate
//          - label: a label for the alternate
//          - lang: optional language
//          - type: optional MIME type
//  - logos: a list of logos to use instead of the W3C logo, each of which being defined by:
//          - src: the URI to the logo (target of <img src=>)
//          - alt: alternate text for the image (<img alt=>), defaults to "Logo" or "Logo 1", "Logo 2", ...
//            if src is not specified, this is the text of the "logo"
//          - height: optional height of the logo (<img height=>)
//          - width: optional width of the logo (<img width=>)
//          - url: the URI to the organization represented by the logo (target of <a href=>)
//          - id: optional id for the logo, permits custom CSS (wraps logo in <span id=>)
//          - each logo element must specifiy either src or alt
//  - testSuiteURI: the URI to the test suite, if any
//  - implementationReportURI: the URI to the implementation report, if any
//  - bugTracker: and object with the following details
//      - open: pointer to the list of open bugs
//      - new: pointer to where to raise new bugs
//  - noRecTrack: set to true if this document is not intended to be on the Recommendation track
//  - edDraftURI: the URI of the Editor's Draft for this document, if any. Required if
//      specStatus is set to "ED".
//  - additionalCopyrightHolders: a copyright owner in addition to pcisig (or the only one if specStatus
//      is unofficial)
//  - overrideCopyright: provides markup to completely override the copyright
//  - cssOverride: if set, name of the stylesheet (useful when running locally)
//  - logoOverride: if set, the uri of the appropriate PCISIG / PCI Express logo
//  - copyrightStart: the year from which the copyright starts running
//  - prevED: the URI of the previous Editor's Draft if it has moved
//  - prevRecShortname: the short name of the previous Recommendation, if the name has changed
//  - prevRecURI: the URI of the previous Recommendation if not directly generated from
//    prevRecShortname.
//  - wg: the name of the WG in charge of the document. This may be an array in which case wgURI
//      and wgPatentURI need to be arrays as well, of the same length and in the same order
//  - wgURI: the URI to the group's page, or an array of such
//  - wgPatentURI: the URI to the group's patent information page, or an array of such. NOTE: this
//      is VERY IMPORTANT information to provide and get right, do not just paste this without checking
//      that you're doing it right
//  - wgPublicList: the name of the mailing list where discussion takes place. Note that this cannot
//      be an array as it is assumed that there is a single list to discuss the document, even if it
//      is handled by multiple groups
//  - charterDisclosureURI: used for IGs (when publishing IG-NOTEs) to provide a link to the IPR commitment
//      defined in their charter.
//  - addPatentNote: used to add patent-related information to the SotD, for instance if there's an open
//      PAG on the document.
//  - thisVersion: the URI to the dated current version of the specification. ONLY ever use this for CG/BG
//      documents, for all others it is autogenerated.
//  - latestVersion: the URI to the latest (undated) version of the specification. ONLY ever use this for CG/BG
//      documents, for all others it is autogenerated.
//  - prevVersion: the URI to the previous (dated) version of the specification. ONLY ever use this for CG/BG
//      documents, for all others it is autogenerated.
//  - subjectPrefix: the string that is expected to be used as a subject prefix when posting to the mailing
//      list of the group.
//  - otherLinks: an array of other links that you might want in the header (e.g., link github, twitter, etc).
//         Example of usage: [{key: "foo", href:"http://b"}, {key: "bar", href:"http://"}].
//         Allowed values are:
//          - key: the key for the <dt> (e.g., "Bug Tracker"). Required.
//          - value: The value that will appear in the <dd> (e.g., "GitHub"). Optional.
//          - href: a URL for the value (e.g., "http://foo.com/issues"). Optional.
//          - class: a string representing CSS classes. Optional.
//  - license: can either be "pcisig" (for the currently default, restrictive license) or "cc-by" for
//      the friendly permissive dual license that nice people use (if they are participating in the
//      HTML WG licensing experiment)


define(
    'pcisig/headers',["handlebars"
    ,"core/utils"
    ,"tmpl!pcisig/templates/headers.handlebars"
    ,"tmpl!pcisig/templates/sotd.handlebars"
    ],
    function (hb, utils, headersTmpl, sotdTmpl) {
        "use strict";
        Handlebars.registerHelper("showPeople", function (name, items) {
            // stuff to handle RDFa
            var re = "", rp = "", rm = "", rn = "", rwu = "", rpu = "";
            if (this.doRDFa !== false) {
                if (name === "Editor") {
                    re = " rel='bibo:editor'";
                    if (this.doRDFa !== "1.0") re += " inlist=''";
                }
                else if (name === "Author") {
                    re = " rel='dcterms:contributor'";
                }
                rn = " property='foaf:name'";
                rm = " rel='foaf:mbox'";
                rp = " typeof='foaf:Person'";
                rwu = " rel='foaf:workplaceHomepage'";
                rpu = " rel='foaf:homepage'";
            }
            var ret = "";
            for (var i = 0, n = items.length; i < n; i++) {
                var p = items[i];
                if (this.doRDFa !== false ) ret += "<dd class='p-author h-card vcard' " + re +"><span" + rp + ">";
                else             ret += "<dd class='p-author h-card vcard'>";
                if (p.url) {
                    if (this.doRDFa !== false ) {
                        ret += "<a class='u-url url p-name fn' " + rpu + rn + " content='" + p.name +  "' href='" + p.url + "'>" + p.name + "</a>";
                    }
                    else {
                        ret += "<a class='u-url url p-name fn' href='" + p.url + "'>"+ p.name + "</a>";
                    }
                }
                else {
                    ret += "<span" + rn + " class='p-name fn'>" + p.name + "</span>";
                }
                if (p.company) {
                    ret += ", ";
                    if (p.companyURL) ret += "<a" + rwu + " class='p-org org h-org h-card' href='" + p.companyURL + "'>" + p.company + "</a>";
                    else ret += p.company;
                }
                if (p.mailto) {
                    ret += ", <span class='ed_mailto'><a class='u-email email' " + rm + " href='mailto:" + p.mailto + "'>" + p.mailto + "</a></span>";
                }
                if (p.note) ret += " (" + p.note + ")";
                if (this.doRDFa !== false ) ret += "</span>\n";
                ret += "</dd>\n";
            }
            return new Handlebars.SafeString(ret);
        });
        

        Handlebars.registerHelper("showLogos", function (items) {
            var ret = "<p>";
            for (var i = 0, n = items.length; i < n; i++) {
                var p = items[i];
                if (p.url) ret += "<a href='" + p.url + "'>";
                if (p.id)  ret += "<span id='" + p.id + "'>";
                if (p.src) {
                    ret += "<img src='" + p.src + "'";
                    if (p.width)  ret += " width='" + p.width + "'";
                    if (p.height) ret += " height='" + p.height + "'";
                    if (p.alt) {
                        ret += " alt='" + p.alt + "'";
                    } else if (items.length == 1) {
                        ret += " alt='Logo'";
                    } else {
                        ret += " alt='Logo " + (i+1) + "'";
                    }
                    ret += "/>"
                } else if (p.alt) {
                    ret += p.alt;
                }
                if (p.url) ret += "</a>";
                if (p.id) ret += "</span>";
            }
            ret += "</p>"
            return new Handlebars.SafeString(ret);
        });

        
        return {
           status2Text: {
                NOTE:           "Note"
            ,   WD:             "Working Draft"
            ,   ED:             "Editor's Draft"
            ,   RC:             "Release Candidate"
            ,   PUBLISH:        "Published"
            ,   TP:             "TechPubs Draft"
            ,   confidential:   "Confidential"
            ,   submission:     "Submission"
            ,   unofficial:     "Unofficial"
            ,   base:           "Document"
            ,   finding:        "Finding"
            }
        ,   noTrackStatus:  ["NOTE", "confidential", "submission", "unofficial", "base", "finding"]
        ,   review2Text: {
                "":                 ""
            ,   NONE:               ""
            ,   "Author-Review":    "Author Review"
            ,   "WG-Review":        "Work Group Review"
            ,   "Cross-WG-Review":  "Cross Work Group Review"
            ,   "Member-Review":    "PCISIG Member Review"
            ,   "Final-Review":     "Final Review"
            ,   "Draft":            "Draft"
        }
        ,   level2Text: {
                "":                 ""
            ,   "0.1":              "0.1 Maturity Level"
            ,   "0.3":              "0.3 Maturity Level"
            ,   "0.5":              "0.5 Maturity Level"
            ,   "0.7":              "0.7 Maturity Level"
            ,   "0.9":              "0.9 Maturity Level"
            ,   "1.0":              "Final"
        }
        ,   run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/headers");

                if (conf.doRDFa !== false) {
                    if (conf.doRDFa === undefined) {
                        conf.doRDFa = '1.1';
                    }
                }

                if (!conf.figFmt) conf.figFmt = "%1" + conf.l10n.fig + "%(%c-%#%): %t";
                if (!conf.tblFmt) conf.tblFmt = "%1" + conf.l10n.tbl + "%(%c-%#%): %t";
                if (!conf.eqnFmt) conf.eqnFmt = "%1" + conf.l10n.eqn + "%(%c-%#%): %t";

                // validate configuration and derive new configuration values
                if (!conf.license) conf.license = "pcisig";
                if (!conf.specStatus) msg.pub("error", "Missing required configuration: specStatus");
//                console.log("initial conf.specStatus = \"" + conf.specStatus + "\"");
//                console.log("initial conf.specReview = \"" + conf.specReview + "\"");
//                console.log("initial conf.specLevel = \"" + conf.specLevel + "\"");
                if (!conf.specReview) {
                    var temp = conf.specStatus.split(/\//);
//                    console.log("split(specStatus).length = " + temp.length);
                    conf.specStatus = (temp.length > 0) ? temp[0] : conf.specStatus;
                    conf.specReview = (temp.length > 1) ? temp[1] : "";
                    if (!conf.specLevel) {
                        conf.specLevel = (temp.length > 2) ? temp[2] : "";
                    }
//                } else {
//                    console.log("!conf.specReview conf.specReview = \"" + !conf.specReview + "\"");
                }
//                console.log("final conf.specStatus = \"" + conf.specStatus + "\"");
//                console.log("final conf.specReview = \"" + conf.specReview + "\"");
//                console.log("final conf.specLevel = \"" + conf.specLevel + "\"");
                if (!conf.shortName) msg.pub("error", "Missing required configuration: shortName");
                conf.title = doc.title || "No Title";
                if (!conf.subtitle) conf.subtitle = "";
                if (!conf.publishDate) {
                    conf.publishDate = utils.parseLastModified(doc.lastModified);
                }
                else {
                    if (!(conf.publishDate instanceof Date))
                        conf.publishDate = utils.parseSimpleDate(conf.publishDate);
                }
                conf.publishYear = conf.publishDate.getFullYear();
                conf.publishHumanDate = utils.humanDate(conf.publishDate);
                if (conf.reviewEndDate) {
                    conf.humanReviewEndDate = utils.humanDate(conf.reviewEndDate);
                }
                conf.isNoTrack = $.inArray(conf.specStatus, this.noTrackStatus) >= 0;
                conf.isTagFinding = conf.specStatus === "finding";
                if (!conf.isNoTrack) {
                    if (!conf.specLevel || conf.specLevel === "") {
                        msg.pub("error", "Standards Track: Missing required configuration: specLevel");
                    }
                    if (!conf.specReview || conf.specReview === "") {
                        msg.pub("error", "Standards Track: Missing required configuration: specReview");
                    }
                }
                if (!conf.specLevel) conf.specLevel = "";
                if (!conf.specReview) conf.specReview = "";
                if (this.review2Text[conf.specReview]) {
                    conf.specReviewLong = this.review2Text[conf.specReview];
                } else {
                    conf.specReviewLong = conf.specReview;
                }
                if (conf.specStatus in this.status2Text) {
                    conf.specStatusLong = this.status2Text[conf.specStatus];
                } else {
                    conf.specStatusLong = conf.specStatus;
                }
                if (this.level2Text[conf.specLevel]) {
                    conf.specLevelLong = this.level2Text[conf.specLevel];
                } else {
                    conf.specLevelLong = conf.specLevel + " Maturity Level";
                }
                if (!conf.edDraftURI) {
                    conf.edDraftURI = "";
                    /*if (conf.specStatus === "ED") msg.pub("warn", "Editor's Drafts should set edDraftURI.");*/
                }
                /*var publishSpace = "TR";
                if (conf.specStatus === "Member-SUBM") publishSpace = "Submission";
                else if (conf.specStatus === "Team-SUBM") publishSpace = "TeamSubmission";
                if (!conf.isCGBG) conf.thisVersion =  "http://www.w3.org/" + publishSpace + "/" +
                                                      conf.publishDate.getFullYear() + "/" +
                                                      conf.maturity + "-" + conf.shortName + "-" +
                                                      utils.concatDate(conf.publishDate) + "/";
                if (conf.specStatus === "ED") conf.thisVersion = conf.edDraftURI;
                if (!conf.isCGBG) conf.latestVersion = "http://www.w3.org/" + publishSpace + "/" + conf.shortName + "/";
                if (conf.isTagFinding) {
                    conf.latestVersion = "http://www.w3.org/2001/tag/doc/" + conf.shortName;
                    conf.thisVersion = conf.latestVersion + "-" + utils.concatDate(conf.publishDate, "-");
                }*/
                /*if (conf.previousPublishDate) {
                    if (!conf.previousMaturity && !conf.isTagFinding)
                        msg.pub("error", "previousPublishDate is set, but not previousMaturity");
                    if (!(conf.previousPublishDate instanceof Date))
                        conf.previousPublishDate = utils.parseSimpleDate(conf.previousPublishDate);
                    var pmat = (this.status2maturity[conf.previousMaturity]) ? this.status2maturity[conf.previousMaturity] :
                                                                               conf.previousMaturity;
                    if (conf.isTagFinding) {
                        conf.prevVersion = conf.latestVersion + "-" + utils.concatDate(conf.previousPublishDate, "-");
                    }
                    else if (conf.isCGBG) {
                        conf.prevVersion = conf.prevVersion || "";
                    }
                    else {
                        conf.prevVersion = "http://www.w3.org/TR/" + conf.previousPublishDate.getFullYear() + "/" + pmat + "-" +
                                           conf.shortName + "-" + utils.concatDate(conf.previousPublishDate) + "/";
                    }
                }
                else {
                    if (conf.specStatus !== "FPWD" && conf.specStatus !== "FPLC" && conf.specStatus !== "ED" && !conf.noRecTrack && !conf.isNoTrack)
                        msg.pub("error", "Document on track but no previous version.");
                    if (!conf.prevVersion) conf.prevVersion = "";
                }*/
                /*if (conf.prevRecShortname && !conf.prevRecURI) conf.prevRecURI = "http://www.w3.org/TR/" + conf.prevRecShortname;*/
//                if (!conf.editors || conf.editors.length === 0) msg.pub("error", "At least one editor is required");
                var peopCheck = function (i, it) {
                    if (!it.name) msg.pub("error", "All authors and editors must have a name.");
                };
                $.each(conf.editors || [], peopCheck);
                $.each(conf.authors || [], peopCheck);
                conf.multipleEditors = conf.editors && conf.editors.length > 1;
                conf.multipleAuthors = conf.authors && conf.authors.length > 1;
                $.each(conf.alternateFormats || [], function (i, it) {
                    if (!it.uri || !it.label) msg.pub("error", "All alternate formats must have a uri and a label.");
                });
                conf.multipleAlternates = conf.alternateFormats && conf.alternateFormats.length > 1;
                conf.alternatesHTML = utils.joinAnd(conf.alternateFormats, function (alt) {
                    var optional = (alt.hasOwnProperty('lang') && alt.lang) ? " hreflang='" + alt.lang + "'" : "";
                    optional += (alt.hasOwnProperty('type') && alt.type) ? " type='" + alt.type + "'" : "";
                    return "<a rel='alternate' href='" + alt.uri + "'" + optional + ">" + alt.label + "</a>";
                });
                if (conf.bugTracker) {
                    if (conf.bugTracker["new"] && conf.bugTracker.open) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker["new"] + "'>file a bug</a>" +
                                              " (<a href='" + conf.bugTracker.open + "'>open bugs</a>)";
                    }
                    else if (conf.bugTracker.open) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker.open + "'>open bugs</a>";
                    }
                    else if (conf.bugTracker["new"]) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker["new"] + "'>file a bug</a>";
                    }
                }
                if (conf.copyrightStart && conf.copyrightStart === conf.publishYear) conf.copyrightStart = "";
                /*if (this.status2rdf[conf.specStatus]) {
                    conf.rdfStatus = this.status2rdf[conf.specStatus];
                }*/
                /*conf.showThisVersion =  (!conf.isNoTrack || conf.isTagFinding);
                conf.showPreviousVersion = (conf.specStatus !== "FPWD" && conf.specStatus !== "FPLC" && conf.specStatus !== "ED" &&
                                           !conf.isNoTrack);
                if (conf.isTagFinding) conf.showPreviousVersion = conf.previousPublishDate ? true : false;
                conf.notYetRec = (conf.isRecTrack && conf.specStatus !== "REC");
                conf.isRec = (conf.isRecTrack && conf.specStatus === "REC");
                if (conf.isRec && !conf.errata)
                    msg.pub("error", "Recommendations must have an errata link.");
                conf.notRec = (conf.specStatus !== "REC");*/
                conf.isUnofficial = conf.specStatus === "unofficial";
                conf.prependPCIeLogo = conf.isUnofficial || !conf.isNoTrack;
                conf.isFinal = (conf.specStatus === "PUBLISH") && (conf.specLevel === "1.0") &&
                    ((conf.specReview === "NONE") || (conf.specReview === ""));
                conf.isPublished = conf.specStatus === "PUBLISH";
                /*conf.isED = (conf.specStatus === "ED");
                conf.isLC = (conf.specStatus === "LC" || conf.specStatus === "FPLC");
                conf.isCR = (conf.specStatus === "CR");
                conf.isPR = (conf.specStatus === "PR");
                conf.isMO = (conf.specStatus === "MO");
                conf.isIGNote = (conf.specStatus === "IG-NOTE");*/
                conf.dashDate = utils.concatDate(conf.publishDate, "-");
                conf.publishISODate = utils.isoDate(conf.publishDate) ;
                // configuration done - yay!
                
                // annotate html element with RFDa
                if (conf.doRDFa) {
                    var $html = $("html");
                    if (conf.rdfStatus) {
                        $html.attr("typeof", "bibo:Document "+conf.rdfStatus ) ;
                    } else {
                        $html.attr("typeof", "bibo:Document ") ;
                    }
                    $html.attr("about", "") ;
                    $html.attr("property", "dcterms:language") ;
                    $html.attr("content", "en") ;
                    var prefixes = "bibo: http://purl.org/ontology/bibo/";
                    if (conf.doRDFa !== '1.1') {
                        $html.attr("version", "XHTML+RDFa 1.0") ;
                        prefixes += " dcterms: http://purl.org/dc/terms/ foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#";
                    }
                    $html.attr("prefix", prefixes);
                }
                // insert into document and mark with microformat
                $("body", doc).prepend($(headersTmpl(conf)))
                              .addClass("h-entry");

                // handle SotD
                var $sotd = $("#sotd");
                if ((!conf.isNoTrack || conf.isTagFinding) && !$sotd.length)
                    msg.pub("error", "A custom SotD paragraph is required for your type of document.");
                conf.sotdCustomParagraph = $sotd.html();
                $sotd.remove();
                if ($.isArray(conf.wg)) {
                    conf.multipleWGs = conf.wg.length > 1;
                    conf.wgHTML = utils.joinAnd($.isArray(conf.wg) ? conf.wg : [conf.wg], function (wg, idx) {
                        return "<a href='" + conf.wgURI[idx] + "'>" + wg + "</a>";
                    });
                    var pats = [];
                    for (var i = 0, n = conf.wg.length; i < n; i++) {
                        pats.push("<a href='" + conf.wgPatentURI[i] + "' rel='disclosure'>" + conf.wg[i] + "</a>");
                    }
                    conf.wgPatentHTML = pats.join(", ");
                }
                else {
                    conf.multipleWGs = false;
                    conf.wgHTML = "<a href='" + conf.wgURI + "'>" + conf.wg + "</a>";
                }
                /*if (conf.isLC && !conf.lcEnd) msg.pub("error", "Status is LC but no lcEnd is specified");
                if (conf.specStatus === "PR" && !conf.lcEnd) msg.pub("error", "Status is PR but no lcEnd is specified (needed to indicate end of previous LC)");
                conf.humanLCEnd = utils.humanDate(conf.lcEnd || "");
                if (conf.specStatus === "CR" && !conf.crEnd) msg.pub("error", "Status is CR but no crEnd is specified");
                conf.humanCREnd = utils.humanDate(conf.crEnd || "");
                if (conf.specStatus === "PR" && !conf.prEnd) msg.pub("error", "Status is PR but no prEnd is specified");
                conf.humanPREnd = utils.humanDate(conf.prEnd || "");

                conf.recNotExpected = (!conf.isRecTrack && conf.maturity == "WD" && conf.specStatus !== "FPWD-NOTE");
                if (conf.isIGNote && !conf.charterDisclosureURI)
                    msg.pub("error", "IG-NOTEs must link to charter's disclosure section using charterDisclosureURI");
                $(conf.isCGBG ? cgbgSotdTmpl(conf) : sotdTmpl(conf)).insertAfter($("#abstract"));

                if (!conf.implementationReportURI && (conf.isCR || conf.isPR || conf.isRec)) {
                    msg.pub("error", "CR, PR, and REC documents need to have an implementationReportURI defined.");
                }*/
                $(sotdTmpl(conf)).insertAfter($("#abstract"));
                if (conf.isTagFinding && !conf.sotdCustomParagraph) {
                    msg.pub("error", "ReSpec does not support automated SotD generation for TAG findings, " +
                                     "please specify one using a <code><section></code> element with ID=sotd.");
                }

//                conf.onlyLocalBiblio = true;

                msg.pub("end", "pcisig/headers");
                cb();
            }
        };
    }
);

/*global define */

/* jshint browser: true */

// Module core/footnotes
//  Handles footnotes.

// CONFIGURATION:

define(
    'core/footnotes',[],function () {
        "use strict";

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/footnotes");
                var $footnotes= $("span.footnote", doc);
                if ($footnotes.length) {
                    $footnotes.each(function(index) {
                        $(this).prepend("<span class='footnote-online'> [Footnote: </span>")
                            .append("<span class='footnote-online'>] </span>");
                        var id = "footnote-" + (index+1);
                        var span = "<span class='footnote-contents' id='footnote-" + (index+1) + "'></span>";
                        var input = "<input type='checkbox' name='footnote-" + (index+1) +
                                                       "' value='#footnote-" + (index+1) + "'></input>";
                        $(this).wrapInner(span)
                            .prepend(input);
                    });
                }
                msg.pub("end", "core/footnotes");
                cb();
            }
        };
    }
);


// Module w3c/abstract
// Handle the abstract section properly.

define(
    'w3c/abstract',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "w3c/abstract");
                var $abs = $("#abstract");
                if ($abs.length) {
                    if ($abs.find("p").length === 0) $abs.contents().wrapAll($("<p></p>"));
                    $abs.prepend("<h2>" + conf.l10n.abstract + "</h2>");
                    $abs.addClass("introductory");
                    if (conf.doRDFa) {
                        var rel = "dc:abstract"
                        ,   ref = $abs.attr("property");
                        if (ref) rel = ref + " " + rel;
                        $abs.attr({ property: rel });
                    }
                }
                else msg.pub("error", "Document must have one element with ID 'abstract'");
                msg.pub("end", "w3c/abstract");
                cb();
            }
        };
    }
);


define('tmpl!pcisig/templates/conformance.handlebars', ['handlebars'], function (hb) { return Handlebars.compile('<h2>Conformance</h2>\n<p>\n    As well as sections marked as non-normative, all authoring guidelines, diagrams, examples,\n    implementation notes,\n    and notes in this specification are non-normative. Everything else in this specification is\n    normative.\n</p>\n<p>\n    The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED,\n    and OPTIONAL in this specification are to be interpreted as described in [[!RFC2119]].\n</p>\n<p>\n    The key words SHALL, SHALL NOT, NOT RECOMMENDED, STRONGLY RECOMMENDED,\n    NOT RECOMMENDED, STRONGLY NOT RECOMMENDED, INDEPENDENTLY OPTIONAL, PERMITTED,\n    and NOT PERMITTED are also used by PCISIG specifications.\n</p>\n<p>\n    The term <em class="rfc2119">MAY</em> is described in [[!RFC2119]].\n    Experience has found this term to be confusing and thus it is not used by PCISIG specifications.\n</p>\n');});

/*globals define*/
/*jshint browser:true, jquery:true */

// Module pcisig/conformance
// Handle the conformance section properly.

define(
    'pcisig/conformance',["tmpl!pcisig/templates/conformance.handlebars"],
    function (confoTmpl) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/conformance");
                var $confo = $("#conformance");
                if ($confo.length) $confo.prepend(confoTmpl(conf));
                msg.pub("end", "pcisig/conformance");
                cb();
            }
        };
    }
);


// Module w3c/data-transform
// Support for the data-transform attribute
// Any element in the tree that has a data-transform attribute is processed here.
// The data-transform attribute can contain a white space separated list of functions
// to call (these must have been defined globally). Each is called with a reference to
// the core/utils plugin and the innerHTML of the element. The output of each is fed
// as the input to the next, and the output of the last one replaces the HTML content
// of the element.
// IMPORTANT:
//  It is unlikely that you should use this module. The odds are that unless you really
//  know what you are doing, you should be using a dedicated module instead. This feature
//  is not actively supported and support for it may be dropped. It is not accounted for
//  in the test suite, and therefore could easily break.

define(
    'core/data-transform',["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/data-transform");
                $("[data-transform]", doc).each(function (i, node) {
                    var $n = $(node);
                    var flist = $n.attr('data-transform');
                    $n.removeAttr('data-transform') ;
                    var content;
                    try {
                        content = utils.runTransforms($n.html(), flist);
                    }
                    catch (e) {
                        msg.pub("error", e);
                    }
                    if (content) $n.html(content);
                });
                msg.pub("end", "core/data-transform");
                cb();
            }
        };
    }
);

/*jshint
    expr: true
*/

// Module core/data-include
// Support for the data-include attribute. Causes external content to be included inside an
// element that has data-include='some URI'. There is also a data-oninclude attribute that
// features a white space separated list of global methods that will be called with the
// module object, the content, and the included URI.
//
// IMPORTANT:
//  This module only really works when you are in an HTTP context, and will most likely
//  fail if you are editing your documents on your local drive. That is due to security
//  restrictions in the browser.
//  It is also important to note that this module performs synchronous requests (which is
//  required since subsequent modules need to apply to the included content) and can therefore
//  entail performance issues.

define(
    'core/data-include',["core/utils"],
    function (utils) {
        
        function filter_data(data, filter_string) {
            if (filter_string === null) return data;
            var filt = filter_string.trim().split(",");
            if (filt.length === 0) filt.push(".*");
            if (filt.length === 1) filt.push("===");
            if (filt.length === 2) filt.push("[,\\s]+");
            var match = false;
            var result = [];
            var chunks = data.split(new RegExp("^" + filt[1], "m"));
            var some_match = function(x) { return x.match("^" + filt[0] + "$"); };
            for (var i = 1; i < chunks.length; i++) {   // skip first chunk
                var nl = chunks[i].indexOf("\n");
                if (nl >= 0) {
                    match = chunks[i].substr(0,nl).trim().split(filt[2]).some(some_match);
                    if (match) result.push(chunks[i].substr(nl+1));
                }
            }
            return result.join("\n");
        }

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/data-include");
                var $incs = $("[data-include]")
                ,   len = $incs.length
                ,   finish = function ($el) {
                        $el.removeAttr("data-include");
                        $el.removeAttr("data-oninclude");
                        $el.removeAttr("data-include-format");
                        $el.removeAttr("data-include-replace");
                        $el.removeAttr("data-include-sync");
                        $el.removeAttr("data-include-filter");
                        len--;
                        if (len <= 0) {
                            msg.pub("end", "core/data-include");
                            cb();
                        }
                    }
                ;
                if (!len) {
                    msg.pub("end", "core/data-include");
                    cb();
                }
                $incs.each(function () {
                    var $el = $(this)
                    ,   uri = $el.attr("data-include")
                    ,   format = $el.attr("data-include-format") || "html"
                    ,   replace = !!$el.attr("data-include-replace")
                    ,   sync = !!$el.attr("data-include-sync")
                    ,   filter = $el.attr("data-include-filter") || null
                    ;
                    if (!!conf.ajaxIsLocal) $.ajaxSetup({ isLocal: true});
                    conf.ajaxIsLocal = false;
                    $.ajax({
                        dataType:   format
                    ,   url:        uri
                    ,   async:      !sync
                    ,   success:    function (data) {
                            if (data) {
                                var flist = $el.attr("data-oninclude");
                                if (flist) data = utils.runTransforms(data, flist, uri);
                                if (filter) data = filter_data(data, filter);
                                if (replace) $el.replaceWith(format === "text" ? doc.createTextNode(data) : data);
                                else format === "text" ? $el.text(data) : $el.html(data);
                            }
                            finish($el);
                        }
                    ,   error:      function (xhr, status, error) {
                            msg.pub("error", "Error including URI=" + uri + ": " + status + " (" + error + ")");
                            finish($el);
                        }
                    });
                });
            }
        };
    }
);

/*globals define */
/*jshint jquery: true */

// Module core/inlines
// Process all manners of inline information. These are done together despite it being
// seemingly a better idea to orthogonalise them. The issue is that processing text nodes
// is harder to orthogonalise, and in some browsers can also be particularly slow.
// Things that are recognised are <abbr>/<acronym> which when used once are applied
// throughout the document, [[REFERENCES]]/[[!REFERENCES]], and RFC2119 keywords.
// CONFIGURATION:
//  These options do not configure the behaviour of this module per se, rather this module
//  manipulates them (oftentimes being the only source to set them) so that other modules
//  may rely on them.
//  - normativeReferences: a map of normative reference identifiers.
//  - informativeReferences: a map of informative reference identifiers.
//  - respecRFC2119: a list of the number of times each RFC2119
//    key word was used.  NOTE: While each member is a counter, at this time
//    the counter is not used.

define(
    'core/inlines',["core/utils"],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/inlines");
                doc.normalize();
                if (!conf.normativeReferences) conf.normativeReferences = {};
                if (!conf.informativeReferences) conf.informativeReferences = {};
                if (!conf.respecRFC2119) conf.respecRFC2119 = {};

                // PRE-PROCESSING
                var abbrMap = {}, acroMap = {};
                $("abbr[title]", doc).each(function () { abbrMap[$(this).text()] = $(this).attr("title"); });
                $("acronym[title]", doc).each(function () { acroMap[$(this).text()] = $(this).attr("title"); });
                var aKeys = [];
                for (var k in abbrMap) aKeys.push(k);
                for (var k in acroMap) aKeys.push(k);
                aKeys.sort(function (a, b) {
                    if (b.length < a.length) return -1;
                    if (a.length < b.length) return 1;
                    return 0;
                });
                var abbrRx = aKeys.length ? "(?:\\b" + aKeys.join("\\b)|(?:\\b") + "\\b)" : null;

                // PROCESSING
                var txts = $("body", doc).allTextNodes(["pre"]);
                var rx = new RegExp("(\\bMUST(?:\\s+NOT)?\\b|\\bSHOULD(?:\\s+NOT)?\\b|\\bSHALL(?:\\s+NOT)?\\b|" +
                                    "\\bMAY\\b|\\b(?:NOT\\s+)?REQUIRED\\b|\\b(?:STRONGLY\\s+)?(?:NOT\\s+)?RECOMMENDED\\b|\\b(?:INDEPENDENTLY\\s+)?OPTIONAL\\b|\\b(?:NOT\\s+)?PERMITTED\\b|" +
                                    "(?:\\[\\[(?:!|\\\\)?[A-Za-z0-9\\.-]+\\]\\])" + ( abbrRx ? "|" + abbrRx : "") + ")");
                for (var i = 0; i < txts.length; i++) {
                    var txt = txts[i];
                    var subtxt = txt.data.split(rx);
                    if (subtxt.length === 1) continue;

                    var df = doc.createDocumentFragment();
                    while (subtxt.length) {
                        var t = subtxt.shift();
                        var matched = null;
                        if (subtxt.length) matched = subtxt.shift();
                        df.appendChild(doc.createTextNode(t));
                        if (matched) {
                            // RFC 2119
                            if (/MUST(?:\s+NOT)?|SHOULD(?:\s+NOT)?|SHALL(?:\s+NOT)?|MAY|(?:NOT\s+)?REQUIRED|(?:STRONGLY\s+)?(?:NOT\s+)?RECOMMENDED|(?:NOT\s+)?PERMITTED|(?:INDEPENDENTLY\s+)?OPTIONAL/.test(matched)) {
                                matched = matched.split(/\s+/).join(" ");
                                df.appendChild($("<em/>").attr({ "class": "rfc2119", title: matched }).text(matched)[0]);
                                // remember which ones were used
                                conf.respecRFC2119[matched] = true;
                            }
                            // BIBREF
                            else if (/^\[\[/.test(matched)) {
                                var ref = matched;
                                ref = ref.replace(/^\[\[/, "");
                                ref = ref.replace(/\]\]$/, "");
                                if (ref.indexOf("\\") === 0) {
                                    df.appendChild(doc.createTextNode("[[" + ref.replace(/^\\/, "") + "]]"));
                                }
                                else {
                                    var norm = false;
                                    if (ref.indexOf("!") === 0) {
                                        norm = true;
                                        ref = ref.replace(/^!/, "");
                                    }
                                    // contrary to before, we always insert the link
                                    if (norm) conf.normativeReferences[ref] = true;
                                    else      conf.informativeReferences[ref] = true;
                                    df.appendChild(doc.createTextNode("["));
                                    df.appendChild($("<cite/>").wrapInner($("<a/>").attr({"class": "bibref", href: "#bib-" + ref}).text(ref))[0]);
                                    df.appendChild(doc.createTextNode("]"));
                                }
                            }
                            // ABBR
                            else if (abbrMap[matched]) {
                                if ($(txt).parents("abbr").length) df.appendChild(doc.createTextNode(matched));
                                else df.appendChild($("<abbr/>").attr({ title: abbrMap[matched] }).text(matched)[0]);
                            }
                            // ACRO
                            else if (acroMap[matched]) {
                                if ($(txt).parents("acronym").length) df.appendChild(doc.createTextNode(matched));
                                else df.appendChild($("<acronym/>").attr({ title: acroMap[matched] }).text(matched)[0]);
                            }
                            // FAIL -- not sure that this can really happen
                            else {
                                msg.pub("error", "Found token '" + matched + "' but it does not correspond to anything");
                            }
                        }
                    }
                    txt.parentNode.replaceChild(df, txt);
                }
                msg.pub("end", "core/inlines");
                cb();
            }
        };
    }
);

/* jshint browser: true */
/* jshint jquery: true */
/* global define */

// Module core/dfn
// Finds all <dfn> elements and populates conf.definitionMap to identify them.
define(
    'core/dfn',[],
    function () {
        "use strict";
        var dfnClass = ["dfn", "pin", "signal", "op", "opcode", "operation", "request", "response",
                        "reply", "message", "msg",  "command", "term", "field", "register",
                        "regpict", "state", "value", "parameter", "argument"];
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/dfn");
                doc.normalize();
                if (!conf.definitionMap) {
                    conf.definitionMap = {};
                }
                if (!conf.definitionHTML) {
                    conf.definitionHTML = {};
                }

                //console.log("\n\n\n\n");

                $("[dfn-for]").each(function() {
                    this.setAttribute("data-dfn-for", this.getAttribute("dfn-for").toLowerCase());
                    this.removeAttribute("dfn-for");
                });

                $("table[id] dfn.field", doc).each(function() {
                    var $dfn = $(this);
                    var $parent_table = $dfn.parents("table[id]")[0];
                    var base_id = "field-" + $parent_table.id.replace(/^tbl-/, "") + "-";
                    var title = $dfn.dfnTitle();
                    $dfn.attr("data-dfn-for", $parent_table.id);
                    //console.log("table[id] dfn.field  base_id=\"" + base_id + "\"");
                    //console.log("title.length = " + title.length + "  title=\"" + title.join("|||") + "\"");

                    if (conf.definitionMap[base_id + title[0]]) {
                        msg.pub("error", "Duplicate definition '" + base_id + title[0] + "'");
                        $dfn.append("<span class=\"respec-error\"> {{ Definition '" + base_id + title[0] + "' is defined more than once. }} </span>");
                    }
                    var id = $dfn.makeID(null, base_id + title[0]);
                    //console.log("<dfn class=\"field\" id=\"" + id + "\">" + $dfn.html() + "</dfn>");
                    conf.definitionMap[id] = id;
                    conf.definitionHTML[id] = $dfn.html();
                    for (i = 0; i < title.length; i++) {
                        //console.log("<dfn" + i + " class=\"field\" title=\"" + base_id + title[i] + "\">" + $dfn.html() + "</dfn>");
                        conf.definitionMap[base_id + title[i]] = conf.definitionMap[id];
                        conf.definitionHTML[base_id + title[i]] = conf.definitionHTML[id];
                    }

                });

                //console.log("\n\n\n\n");

                $("dfn", doc).each(function() {
                    var $dfn = $(this);
                    if ($dfn.hasClass("field") && ($dfn.parents("table[id]").length > 0)) {
                        return;
                    }
                    if ($dfn.attr("for")) {
                        $dfn.attr("data-dfn-for", $dfn.attr("for").toLowerCase());
                        $dfn.removeAttr("for");
                    } else {
                        $dfn.attr("data-dfn-for", ($dfn.closest("[data-dfn-for]").attr("data-dfn-for") || "").toLowerCase());
                    }
                    var tag = dfnClass[0];  // default "dfn"
                    for (var i = 1; i < dfnClass.length; i++) {
                        if ($dfn.hasClass(dfnClass[i])) {
                            tag = dfnClass[i];
                        }
                    }
                    var title = $dfn.dfnTitle();
                    //console.log("title.length = " + title.length + "  title=\"" + title.join("|||") + "\"");
                    if (conf.definitionMap[tag + "-" + title[0]]) {
                        msg.pub("error", "Duplicate definition '" + tag + "-" + title[0] + "'");
                        $dfn.append("<span class=\"respec-error\"> {{ Definition '" + tag + "-" + title[0] + "' is defined more than once. }} </span>");
                    }
                    var id = $dfn.makeID(tag, title[0]);
                    //console.log("<dfn class=\"" + tag + "\" id=\"" + id + "\">" + $dfn.html() + "</dfn>");
                    conf.definitionMap[id] = id;
                    conf.definitionHTML[id] = $dfn.html();
                    for (i = 0; i < title.length; i++) {
                        //console.log("<dfn" + i + " class=\"" + tag + "\" title=\"" + tag + "-" + title[i] + "\">" + $dfn.html() + "</dfn>");
                        conf.definitionMap[tag + "-" + title[i]] = conf.definitionMap[id];
                        conf.definitionHTML[tag + "-" + title[i]] = conf.definitionHTML[id];
                    }
                });

                //console.log("\n\n\n\n");

                $("div.hasSVG g[id]", doc).each(function() {
                    var $text = $("text.regFieldName", this).first();
                    if ($text) {
                        var title = $text.dfnTitle();
                        var id = $(this).attr("id");
                        //console.log("<dfn class=\"regpict\" id=\"" + id + "\">" + $(this).text() + "</dfn>");
                        conf.definitionMap[id] = id;
                        conf.definitionHTML[id] = $text.text();
                        var found = null;
                        for (i = 0; i < title.length; i++) {
                            //console.log("<dfn" + i + " class=\"regpict\" title=\"regpict-" + title[i] + "\">" + $(this).text() + "</dfn>");
                            conf.definitionMap["regpict-" + title[i]] = id;
                            conf.definitionHTML["regpict-" + title[i]] = conf.definitionHTML[id];
                            if (conf.definitionMap["field-" + title[i]]) {
                                found = conf.definitionMap["field-" + title[i]];
                            }
                        }
                        id = id.replace(/^regpict-/, "field-");
                        if (conf.definitionMap[id]) {
                            found = conf.definitionMap[id];
                        }
                        if (found) {
                            var $rect = $("rect.regFieldBox", this).first();
                            //console.log("Map[field-" + title + "]=" + conf.definitionMap["field-" + title]);
                            //console.log(" $rect.length= " + $rect.length);
                            //console.log(" $rect[0] is " + $rect[0]);
                            //console.log(" wrapping field-" + title);
                            var a = doc.createElementNS("http://www.w3.org/2000/svg", "a");
                            a.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + found);
//                            a.setAttribute("class", "regLink");
//                            a.setAttribute("target", "_parent");
                            $rect.wrap(a);
//                            $rect[0].setAttribute("class", $rect[0].getAttribute("class") + " regLink");
//                            $rect[0].setAttributeNS("http://www.w3.org/2000/svg", "class",
//                                                    $rect[0].getAttributeNS("http://www.w3.org/2000/svg", "class") + " regLink");
                            var b = doc.createElementNS("http://www.w3.org/2000/svg", "a");
                            b.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + found);
//                            b.setAttribute("class", "regLink");
//                            b.setAttribute("target", "_parent");
//                            b.setAttributeNS("http://www.w3.org/1999/xhtml", "class", "field internalDFN");
//                            b.setAttributeNS("http://www.w3.org/2000/svg", "class", "field internalDFN");
                            $text.wrap(b);
//                            $text[0].setAttribute("class", $text[0].getAttribute("class") + " regLink");
                        }
                    }
                });

                //console.log("\n\n\n\n");

                $("dfn.field", doc).each(function() {
                    var id = this.id.replace(/^field-/,"#regpict-");
                    if (id !== this.id) {
                        //console.log("field-->regpict: looking for " + this.id + " --> " + id);
                        var $regpict = $(id, doc);
                        if ($regpict.length > 0) {
                            var $regfig = $regpict.parents("figure[id]");
                            if ($regfig.length > 0) {
                                $(this).wrapInner("<a href=\"#" + $regfig.attr("id") + "\"></a>");
                                //console.log("field-->regpict: <dfn class=\"" + this["class"] +
                                //                 "\" id=\"" + $regfig("id") + "\">" + $(this).html() + "</dfn>");
                                //console.log("");
                            }
                        }
                    }
                });

                //console.log("\n\n\n\n");

                $("a:not([href]):not([tabindex])", doc)
                    .filter(
                    function() {
                        return (this.getAttributeNodeNS("http://www.w3.org/1999/xlink", "href") === null);
                    })
                    .each(
                    function() {
                        //console.log("a:not([href]): " + this.tagName + "  " + this.namespaceURI + "  " + this.outerHTML);
                        var $ant = $(this);
                        if ($ant.hasClass("externalDFN")) {
                            return;
                        }
                        /*var hrefNode = this.getAttributeNodeNS("http://www.w3.org/1999/xlink", "href");
                         if (hrefNode) {
                         console.log("  getAttributeNS() localName=" + hrefNode.localName +
                         " nodeName=" + hrefNode.nodeName +
                         " nodeType=" + hrefNode.nodeType +
                         " namespaceURI=" + hrefNode.namespaceURI);
                         return;
                         }*/
                        var title = $ant.dfnTitle()[0];
                        var tag = null;
                        var temp = $ant.attr("class");
                        var i;
                        if (temp) {
                            //console.log("class=" + temp);
                            temp = temp.split(/\s+/);
                            for (i = 0; i < temp.length; i++) {
                                //console.log("checking " + temp[i] + "-" + title);
                                if (conf.definitionMap[temp[i] + "-" + title]) {
                                    tag = temp[i];
                                    //console.log("found " + temp[i] + "-" + title);
                                }
                            }
                        }
                        if (tag === null) {
                            for (i = 0; i < dfnClass.length; i++) {
                                if (conf.definitionMap[dfnClass[i] + "-" + title]) {
                                    if (tag === null) {
                                        tag = dfnClass[i];
                                    } else {
                                        tag = tag + "-" + dfnClass[i];
                                    }
                                }
                            }
                        }
                        if (tag !== null) {
                            //console.log("tag= " + tag);
                            if (tag === "regpict-field" || tag === "field-regpict") {
                                tag = "field";
                            }
                            //console.log("tag= " + tag);
                            var warn = null;
                            if (tag.match(/-/)) {
                                warn = "Ambiguous reference to '(" + tag + ")-" + title + "'";
                                tag = tag.split("-")[0];
                                warn = warn + ", resolved as '" + tag + "'";
                                msg.pub("warn", warn);
                            }
                            $ant.attr("href", "#" + conf.definitionMap[tag + "-" + title])
                                .addClass("internalDFN")
                                .addClass(tag);
                            if (conf.definitionHTML[tag + "-" + title] && !$ant.attr("title")) {
                                $ant.html(conf.definitionHTML[tag + "-" + title]);
                            }
                            if (warn !== null) {
                                $ant.append("<span class=\"respec-error\"> {{ " + warn + " }} </span>");
                            }
                            //console.log("result: " + $ant[0].outerHTML);
                        }
                        else {
                            // ignore WebIDL
                            if (!$ant.parents(".idl, dl.methods, dl.attributes, dl.constants, dl.constructors, dl.fields, dl.dictionary-members, span.idlMemberType, span.idlTypedefType, div.idlImplementsDesc").length) {
                                msg.pub("warn",
                                        "Found linkless <a> element with text '" + title + "' but no matching <dfn>.");
                            }
                            $ant.replaceWith($ant.contents());
                        }
                    }
                )
                ;
                if (conf.addDefinitionMap) {
                    msg.pub("start", "core/dfn/addDefinitionMap");
                    var $mapsec = $("<section id='definition-map' class='introductory appendix'><h2>Definition Map</h2></section>").appendTo($("body"));
                    var $tbody = $("<table class='data'><thead><tr><th>Kind</th><th>Name</th><th>ID</th><th>HTML</th></tr></thead><tbody/></table>").appendTo($mapsec).children("tbody");
                    var keys = Object.keys(conf.definitionMap).sort();
                    for (var i = 0; i < keys.length; i++) {
                        var d = keys[i];
                        var item = d.split(/-/);
                        var kind = item.shift();
                        var id = conf.definitionMap[d];
                        $("<tr><td class='long'>" + kind + "</td><td class='long'>" + item.join("-") + "</td><td class='long'><a href=\"" + "#" + id + "\">" + id + "</a></td><td class='long'>" + conf.definitionHTML[d] + "</td></tr>").appendTo($tbody);
                    }
                    msg.pub("end", "core/dfn/addDefinitionMap");
                }
                msg.pub("end", "core/dfn");
                cb();
            }
        };
    }
);

// Module w3c/rfc2119
// update the 2119 terms section with the terms actually used

define(
    'w3c/rfc2119',["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "w3c/rfc2119");
                var $confo = $("#respecRFC2119");
                if ($confo.length) {
                    // do we have a list of used RFC2119 items in
                    // conf.respecRFC2119
                    var used = Object.getOwnPropertyNames(conf.respecRFC2119).sort() ;
                    if (used && used.length) {
                        // put in the 2119 clause and reference
                        var str = "The " ;
                        var mapper = function(item) {
                            var ret = "<em class='rfc2119' title='"+item+"'>"+item+"</em>" ;
                            return ret;
                        };

                        if (used.length > 1) {
                            str += "key words " + utils.joinAnd(used, mapper) + " are ";
                        }
                        else {
                            str += "key word " + utils.joinAnd(used, mapper) + " is " ;
                        }
                        str += $confo[0].innerHTML ;
                        $confo[0].innerHTML = str ;
                    }
                    else {
                        // there are no terms used - remove the
                        // clause
                        $confo.remove() ;
                    }
                }
                msg.pub("end", "w3c/rfc2119");
                cb();
            }
        };
    }
);


define('text!core/css/examples.css',[],function () { return '/* --- EXAMPLES --- */\ndiv.example-title {\n    min-width: 7.5em;\n    color: #b9ab2d;\n}\ndiv.example-title span {\n    text-transform: uppercase;\n}\naside.example, div.example, div.illegal-example {\n    padding: 0.5em;\n    margin: 1em 0;\n    position: relative;\n    clear: both;\n}\ndiv.illegal-example { color: red }\ndiv.illegal-example p { color: black }\naside.example, div.example {\n    padding: .5em;\n    border-left-width: .5em;\n    border-left-style: solid;\n    border-color: #e0cb52;\n    background: #fcfaee;\n}\n\naside.example div.example {\n    border-left-width: .1em;\n    border-color: #999;\n    background: #fff;\n}\naside.example div.example div.example-title {\n    color: #999;\n}\n';});


define('text!core/css/examples-webspecs.css',[],function () { return '/* --- EXAMPLES CONFLICTING WITH WEBSPECS --- */\naside.example:before, div.example:before, div.illegal-example:before, pre.example:before {\n    content:    "" !important;\n    display:    none;\n}\ndiv.example-title {\n    color: #ef0000;\n}\n';});

/* globals define */
/* jshint browser: true, jquery: true, laxcomma: true */

// Module core/examples
// Manages examples, including marking them up, numbering, inserting the title,
// and reindenting.
// Examples are any pre element with class "example" or "illegal-example".
// When an example is found, it is reported using the "example" event. This can
// be used by a containing shell to extract all examples.

define(
    'core/examples',["text!core/css/examples.css", "text!core/css/examples-webspecs.css"],
    function (css, cssKraken) {
        var makeTitle = function (conf, $el, num, report) {
            var txt = (num > 0) ? " " + num : ""
            ,   $tit = $("<div class='example-title'><span>Example" + txt + "</span></div>");
            report.title = $el.attr("title");
            if (report.title) {
                $tit.append($("<span style='text-transform: none'>: " + report.title + "</span>"));
                $el.removeAttr("title");
            }
            if (conf.useExperimentalStyles) {
                $tit.addClass("marker") ;
            }
            return $tit;
        };

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/examples");
                var $exes = $("pre.example, pre.illegal-example, aside.example")
                ,   num = 0
                ;
                if ($exes.length) {
                    if (conf.specStatus === "webspec") css += cssKraken;
                    $(doc).find("head link").first().before($("<style/>").text(css));
                    $exes.each(function (i, ex) {
                        var $ex = $(ex)
                        ,   report = { number: num, illegal: $ex.hasClass("illegal-example") }
                        ;
                        if ($ex.is("aside")) {
                            num++;
                            var $tit = makeTitle(conf, $ex, num, report);
                            $ex.prepend($tit);
                            msg.pub("example", report);
                        }
                        else {
                            var inAside = !!$ex.parents("aside").length;
                            if (!inAside) num++;
                            // reindent
                            var lines = $ex.html().split("\n");
                            while (lines.length && /^\s*$/.test(lines[0])) lines.shift();
                            while (lines.length && /^\s*$/.test(lines[lines.length - 1])) lines.pop();
                            var matches = /^(\s+)/.exec(lines[0]);
                            if (matches) {
                                var rep = new RegExp("^" + matches[1]);
                                for (var j = 0; j < lines.length; j++) {
                                    lines[j] = lines[j].replace(rep, "");
                                }
                            }
                            report.content = lines.join("\n");
                            $ex.html(lines.join("\n"));
                            if (conf.useExperimentalStyles) {
                                $ex.removeClass("example illegal-example");
                            }
                            // wrap
                            var $div = $("<div class='example'></div>")
                            ,   $tit = makeTitle(conf, $ex, inAside ? 0 : num, report)
                            ;
                            $div.append($tit);
                            $div.append($ex.clone());
                            $ex.replaceWith($div);
                            if (!inAside) msg.pub("example", report);
                        }
                    });
                }
                msg.pub("end", "core/examples");
                cb();
            }
        };
    }
);


define('text!core/css/issues-notes.css',[],function () { return '/* --- ISSUES/NOTES --- */\ndiv.issue-title, div.note-title , div.ednote-title, div.warning-title, div.impnote-title {\n    padding-right:  1em;\n    min-width: 7.5em;\n    color: #b9ab2d;\n}\ndiv.issue-title { color: #e05252; }\ndiv.note-title, div.ednote-title { color: #2b2; }\ndiv.impnote-title { color: #0060A9; }\ndiv.warning-title { color: #f22; }\ndiv.issue-title span, div.note-title span, div.ednote-title span, div.warning-title span, div.impnote-title span {\n    text-transform: uppercase;\n}\ndiv.note, div.issue, div.ednote, div.warning, div.impnote {\n    margin-top: 1em;\n    margin-bottom: 1em;\n}\n.note > p:first-child, .ednote > p:first-child, .issue > p:first-child, .warning > p:first-child, .impnote > p:first-child { margin-top: 0; }\n.issue, .note, .ednote, .warning, .impnote {\n    padding: .5em;\n    border-left-width: .5em;\n    border-left-style: solid;\n}\ndiv.issue, div.note, div.ednote, div.warning, div.impnote {\n    padding: 1em 1.2em 0.5em;\n    margin: 1em 0;\n    position: relative;\n    clear: both;\n}\nspan.note, span.ednote, span.issue, span.warning, span.impnote { padding: .1em .5em .15em; }\n\n.issue {\n    border-color: #e05252;\n    background: #fbe9e9;\n}\n.note, .ednote {\n    border-color: #52e052;\n    background: #e9fbe9;\n}\n.impnote {\n    border-color: #0060A9;\n    background: #E5F4FF;\n}\n\n.warning {\n    border-color: #f11;\n    border-right-width: .2em;\n    border-top-width: .2em;\n    border-bottom-width: .2em;\n    border-style: solid;\n    background: #fbe9e9;\n}\n\n.warning-title:before{\n    content: "⚠"; /*U+26A0 WARNING SIGN*/\n    font-size: 3em;\n    float: left;\n    height: 100%;\n    padding-right: .3em;\n    vertical-align: top;\n    margin-top: -0.5em;\n}\n\nli.task-list-item {\n    list-style: none;\n}\n\ninput.task-list-item-checkbox {\n    margin: 0 0.35em 0.25em -1.6em;\n    vertical-align: middle;\n}\n';});

// Helpers for the GitHub API.

define(
    'github',[],
    function () {
        function findNext(header) {
            // Finds the next URL of paginated resources which
            // is available in the Link header. Link headers look like this:
            // Link: <url1>; rel="next", <url2>; rel="foo"; bar="baz"
            // More info here: https://developer.github.com/v3/#link-header
            var m = (header||"").match(/<([^>]+)>\s*;\s*rel="next"/);
            return (m && m[1]) || null;
        }
        
        function fetch(url, options) {
            if (options) {
                options.url = url;
                url = options;
            }
            return $.ajax(url);
        }
        function fetchAll(url, options) {
            return _fetchAll(url, options, []);
        }
        
        function _fetchAll(url, options, output) {
            var request = fetch(url, options);
            return request.then(function(resp) {
                output.push.apply(output, resp);
                var next = findNext(request.getResponseHeader("Link"));
                return next ? _fetchAll(next, options, output) : output;
            });
        }
        
        return {
            fetch: fetch,
            fetchAll: fetchAll,
            fetchIndex: function(url, options) {
                // converts URLs of the form:
                // https://api.github.com/repos/user/repo/comments{/number}
                // into:
                // https://api.github.com/repos/user/repo/comments
                // which is what you need if you want to get the index.
                return fetchAll(url.replace(/\{[^}]+\}/, ""), options);
            }
        };
    }
);

/*globals define */
/*jshint jquery: true, laxcomma: true*/
// Module core/issues-notes
// Manages issues and notes, including marking them up, numbering, inserting the title,
// and injecting the style sheet.
// These are elements with classes "issue" or "note".
// When an issue or note is found, it is reported using the "issue" or "note" event. This can
// be used by a containing shell to extract all of these.
// Issues are automatically numbered by default, but you can assign them specific numbers (or,
// despite the name, any arbitrary identifier) using the data-number attribute. Note that as
// soon as you use one data-number on any issue all the other issues stop being automatically
// numbered to avoid involuntary clashes.
// If the configuration has issueBase set to a non-empty string, and issues are
// manually numbered, a link to the issue is created using issueBase and the issue number

define(
    'core/issues-notes',["text!core/css/issues-notes.css", "github"],
    function (css, github) {
        return {
            run:    function (conf, doc, cb, msg) {
                function onEnd () {
                    msg.pub("end", "core/issues-notes");
                    cb();
                }
                
                function handleIssues ($ins, ghIssues, issueBase) {
                    $(doc).find("head link").first().before($("<style/>").text(css));
                    var hasDataNum = $(".issue[data-number]").length > 0
                    ,   issueNum = 0
                    ,   $issueSummary = $("<div><h2>Issue Summary</h2><ul></ul></div>")
                    ,   $issueList = $issueSummary.find("ul");
                    $ins.each(function (i, inno) {
                        var $inno = $(inno)
                        ,   isIssue = $inno.hasClass("issue")
                        ,   isImpNote = $inno.hasClass("impnote")
                        ,   isWarning = $inno.hasClass("warning")
                        ,   isEdNote = $inno.hasClass("ednote")
                        ,   isFeatureAtRisk = $inno.hasClass("atrisk")
                        ,   isInline = $inno.css("display") != "block"
                        ,   dataNum = $inno.attr("data-number")
                        ,   report = { inline: isInline, content: $inno.html() }
                        ;
                        report.type = isIssue ? "issue" : isWarning ? "warning" : isEdNote ? "ednote" : isImpNote ? "impnote" : "note";

                        if (isIssue && !isInline && !hasDataNum) {
                            issueNum++;
                            report.number = issueNum;
                        }
                        else if (dataNum) {
                            report.number = dataNum;
                        }

                        // wrap
                        if (!isInline) {
                            var $div = $("<div class='" + report.type + (isFeatureAtRisk ? " atrisk" : "") + "'></div>")
                            ,   $tit = $("<div class='" + report.type + "-title'><span></span></div>")
                            ,   text = (isIssue
                                        ? (isFeatureAtRisk ? "Feature at Risk" : "Issue")
                                        : isWarning ? "Warning"
                                        : (isImpNote ? "Implementation Note" : "Note"))
                            ,   ghIssue
                            ;
                            report.title = $inno.attr("title");
                            if (isIssue) {
                                if (hasDataNum) {
                                    if (dataNum) {
                                        text += " " + dataNum;
                                        // Set issueBase to cause issue to be linked to the external issue tracker
                                        if (!isFeatureAtRisk && conf.issueBase) {
                                            $tit.find("span").wrap($("<a href='" + conf.issueBase + dataNum + "'/>"));
                                        }
                                        else if (isFeatureAtRisk && conf.atRiskBase) {
                                            $tit.find("span").wrap($("<a href='" + conf.atRiskBase + dataNum + "'/>"));
                                        }
                                        ghIssue = ghIssues[dataNum];
                                        if (ghIssue && !report.title) {
                                            report.title = ghIssue.title;
                                        }
                                    }
                                }
                                else {
                                    text += " " + issueNum;
                                }
                                if (report.number !== undefined) {
                                    // Add entry to #issue-summary.
                                    var id = "issue-" + report.number
                                    ,   $li = $("<li><a></a></li>")
                                    ,   $a = $li.find("a");
                                
                                    $div.attr("id", id);
                                    $a.attr("href", "#" + id).text("Issue " + report.number);

                                    if (report.title) {
                                        $li.append(doc.createTextNode(": " + report.title));
                                    }
                                    $issueList.append($li);
                                }
                            }
                            $tit.find("span").text(text);
                            
                            if (report.title) {
                                $tit.append(doc.createTextNode(": " + report.title));
                                $inno.removeAttr("title");
                            }
                            $div.append($tit);
                            $inno.replaceWith($div);
                            var body = $inno.removeClass(report.type).removeAttr("data-number");
                            if (ghIssue && !body.text().trim()) {
                                body = ghIssue.body_html;
                            }
                            $div.append(body);
                        }
                        msg.pub(report.type, report);
                    });
                    
                    if ($(".issue").length) {
                        if ($("#issue-summary")) $("#issue-summary").append($issueSummary.contents());
                    }
                    else if ($("#issue-summary").length) {
                        msg.pub("warn", "Using issue summary (#issue-summary) but no issues found.");
                        $("#issue-summary").remove();
                    }
                }
                msg.pub("start", "core/issues-notes");
                var $ins = $(".issue, .note, .warning, .ednote, .impnote")
                ,   ghIssues = {}
                ,   issueBase = conf.issueBase;
                if ($ins.length) {
                    if (conf.githubAPI) {
                        github.fetch(conf.githubAPI).then(function (json) {
                            issueBase = issueBase || json.html_url + "/issues/";
                            return github.fetchIndex(json.issues_url, {
                                // Get back HTML content instead of markdown
                                // See: https://developer.github.com/v3/media/
                                headers: {
                                    Accept: "application/vnd.github.v3.html+json"
                                }
                            });
                        }).then(function (issues) {
                            issues.forEach(function (issue) {
                                ghIssues[issue.number] = issue;
                            });
                            handleIssues($ins, ghIssues, issueBase);
                            onEnd();
                        });
                    } else {
                        handleIssues($ins, ghIssues, issueBase);
                        onEnd();
                    }
                } else {
                    onEnd();
                }
            }
        };
    }
);

// Module core/requirements
// This module does two things:
//
// 1.  It finds and marks all requirements. These are elements with class "req".
//     When a requirement is found, it is reported using the "req" event. This
//     can be used by a containing shell to extract them.
//     Requirements are automatically numbered.
//
// 2.  It allows referencing requirements by their ID simply using an empty <a>
//     element with its href pointing to the requirement it should be referencing
//     and a class of "reqRef".

define(
    'core/requirements',[],
    function () {
        return {
            run: function (conf, doc, cb, msg) {
                msg.pub("start", "core/requirements");

                $(".req").each(function (i) {
                    i++;
                    var $req = $(this)
                    ,   title = "Req. " + i
                    ;
                    msg.pub("req", {
                        type: "req",
                        number: i,
                        content: $req.html(),
                        title: title
                    });
                    $req.prepend("<a href='#" + $req.attr("id") + "'>" + title + "</a>: ");
                });

                $("a.reqRef").each(function () {
                    var $ref = $(this)
                    ,   href = $ref.attr("href")
                    ,   id
                    ,   $req
                    ,   txt
                    ;
                    if (!href) return;
                    id = href.substring(1);
                    $req = $("#" + id);
                    if ($req.length) {
                        txt = $req.find("> a").text();
                    }
                    else {
                        txt = "Req. not found '" + id + "'";
                        msg.pub("error", "Requirement not found in a.reqRef: " + id);
                    }
                    $ref.text(txt);
                });

                msg.pub("end", "core/requirements");
                cb();
            }
        };
    }
);


define('text!core/css/highlight.css',[],function () { return '/* HIGHLIGHTS */\ncode.prettyprint {\n    color:  inherit;\n}\n\n/* this from google-code-prettify */\n.pln{color:#000}@media screen{.str{color:#080}.kwd{color:#008}.com{color:#800}.typ{color:#606}.lit{color:#066}.pun,.opn,.clo{color:#660}.tag{color:#008}.atn{color:#606}.atv{color:#080}.dec,.var{color:#606}.fun{color:red}}@media print,projection{.str{color:#060}.kwd{color:#006;font-weight:bold}.com{color:#600;font-style:italic}.typ{color:#404;font-weight:bold}.lit{color:#044}.pun,.opn,.clo{color:#440}.tag{color:#006;font-weight:bold}.atn{color:#404}.atv{color:#060}}ol.linenums{margin-top:0;margin-bottom:0}li.L0,li.L1,li.L2,li.L3,li.L5,li.L6,li.L7,li.L8{list-style-type:none}li.L1,li.L3,li.L5,li.L7,li.L9{background:#eee}\n';});

// Copyright (C) 2006 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


/**
 * @fileoverview
 * some functions for browser-side pretty printing of code contained in html.
 *
 * <p>
 * For a fairly comprehensive set of languages see the
 * <a href="http://google-code-prettify.googlecode.com/svn/trunk/README.html#langs">README</a>
 * file that came with this source.  At a minimum, the lexer should work on a
 * number of languages including C and friends, Java, Python, Bash, SQL, HTML,
 * XML, CSS, Javascript, and Makefiles.  It works passably on Ruby, PHP and Awk
 * and a subset of Perl, but, because of commenting conventions, doesn't work on
 * Smalltalk, Lisp-like, or CAML-like languages without an explicit lang class.
 * <p>
 * Usage: <ol>
 * <li> include this source file in an html page via
 *   {@code <script type="text/javascript" src="/path/to/prettify.js"></script>}
 * <li> define style rules.  See the example page for examples.
 * <li> mark the {@code <pre>} and {@code <code>} tags in your source with
 *    {@code class=prettyprint.}
 *    You can also use the (html deprecated) {@code <xmp>} tag, but the pretty
 *    printer needs to do more substantial DOM manipulations to support that, so
 *    some css styles may not be preserved.
 * </ol>
 * That's it.  I wanted to keep the API as simple as possible, so there's no
 * need to specify which language the code is in, but if you wish, you can add
 * another class to the {@code <pre>} or {@code <code>} element to specify the
 * language, as in {@code <pre class="prettyprint lang-java">}.  Any class that
 * starts with "lang-" followed by a file extension, specifies the file type.
 * See the "lang-*.js" files in this directory for code that implements
 * per-language file handlers.
 * <p>
 * Change log:<br>
 * cbeust, 2006/08/22
 * <blockquote>
 *   Java annotations (start with "@") are now captured as literals ("lit")
 * </blockquote>
 * @requires console
 */

// JSLint declarations
/*global console, document, navigator, setTimeout, window, define */

/** @define {boolean} */
var IN_GLOBAL_SCOPE = true;

/**
 * Split {@code prettyPrint} into multiple timeouts so as not to interfere with
 * UI events.
 * If set to {@code false}, {@code prettyPrint()} is synchronous.
 */
window['PR_SHOULD_USE_CONTINUATION'] = true;

/**
 * Pretty print a chunk of code.
 * @param {string} sourceCodeHtml The HTML to pretty print.
 * @param {string} opt_langExtension The language name to use.
 *     Typically, a filename extension like 'cpp' or 'java'.
 * @param {number|boolean} opt_numberLines True to number lines,
 *     or the 1-indexed number of the first line in sourceCodeHtml.
 * @return {string} code as html, but prettier
 */
var prettyPrintOne;
/**
 * Find all the {@code <pre>} and {@code <code>} tags in the DOM with
 * {@code class=prettyprint} and prettify them.
 *
 * @param {Function} opt_whenDone called when prettifying is done.
 * @param {HTMLElement|HTMLDocument} opt_root an element or document
 *   containing all the elements to pretty print.
 *   Defaults to {@code document.body}.
 */
var prettyPrint;


(function () {
  var win = window;
  // Keyword lists for various languages.
  // We use things that coerce to strings to make them compact when minified
  // and to defeat aggressive optimizers that fold large string constants.
  var FLOW_CONTROL_KEYWORDS = ["break,continue,do,else,for,if,return,while"];
  var C_KEYWORDS = [FLOW_CONTROL_KEYWORDS,"auto,case,char,const,default," + 
      "double,enum,extern,float,goto,inline,int,long,register,short,signed," +
      "sizeof,static,struct,switch,typedef,union,unsigned,void,volatile"];
  var COMMON_KEYWORDS = [C_KEYWORDS,"catch,class,delete,false,import," +
      "new,operator,private,protected,public,this,throw,true,try,typeof"];
  var CPP_KEYWORDS = [COMMON_KEYWORDS,"alignof,align_union,asm,axiom,bool," +
      "concept,concept_map,const_cast,constexpr,decltype,delegate," +
      "dynamic_cast,explicit,export,friend,generic,late_check," +
      "mutable,namespace,nullptr,property,reinterpret_cast,static_assert," +
      "static_cast,template,typeid,typename,using,virtual,where"];
  var JAVA_KEYWORDS = [COMMON_KEYWORDS,
      "abstract,assert,boolean,byte,extends,final,finally,implements,import," +
      "instanceof,interface,null,native,package,strictfp,super,synchronized," +
      "throws,transient"];
  var CSHARP_KEYWORDS = [COMMON_KEYWORDS,
      "abstract,as,base,bool,by,byte,checked,decimal,delegate,descending," +
      "dynamic,event,finally,fixed,foreach,from,group,implicit,in,interface," +
      "internal,into,is,let,lock,null,object,out,override,orderby,params," +
      "partial,readonly,ref,sbyte,sealed,stackalloc,string,select,uint,ulong," +
      "unchecked,unsafe,ushort,var,virtual,where"];
  var COFFEE_KEYWORDS = "all,and,by,catch,class,else,extends,false,finally," +
      "for,if,in,is,isnt,loop,new,no,not,null,of,off,on,or,return,super,then," +
      "throw,true,try,unless,until,when,while,yes";
  var JSCRIPT_KEYWORDS = [COMMON_KEYWORDS,
      "debugger,eval,export,function,get,null,set,undefined,var,with," +
      "Infinity,NaN"];
  var PERL_KEYWORDS = "caller,delete,die,do,dump,elsif,eval,exit,foreach,for," +
      "goto,if,import,last,local,my,next,no,our,print,package,redo,require," +
      "sub,undef,unless,until,use,wantarray,while,BEGIN,END";
  var PYTHON_KEYWORDS = [FLOW_CONTROL_KEYWORDS, "and,as,assert,class,def,del," +
      "elif,except,exec,finally,from,global,import,in,is,lambda," +
      "nonlocal,not,or,pass,print,raise,try,with,yield," +
      "False,True,None"];
  var RUBY_KEYWORDS = [FLOW_CONTROL_KEYWORDS, "alias,and,begin,case,class," +
      "def,defined,elsif,end,ensure,false,in,module,next,nil,not,or,redo," +
      "rescue,retry,self,super,then,true,undef,unless,until,when,yield," +
      "BEGIN,END"];
   var RUST_KEYWORDS = [FLOW_CONTROL_KEYWORDS, "as,assert,const,copy,drop," +
      "enum,extern,fail,false,fn,impl,let,log,loop,match,mod,move,mut,priv," +
      "pub,pure,ref,self,static,struct,true,trait,type,unsafe,use"];
  var SH_KEYWORDS = [FLOW_CONTROL_KEYWORDS, "case,done,elif,esac,eval,fi," +
      "function,in,local,set,then,until"];
  var ALL_KEYWORDS = [
      CPP_KEYWORDS, CSHARP_KEYWORDS, JSCRIPT_KEYWORDS, PERL_KEYWORDS,
      PYTHON_KEYWORDS, RUBY_KEYWORDS, SH_KEYWORDS];
  var C_TYPES = /^(DIR|FILE|vector|(de|priority_)?queue|list|stack|(const_)?iterator|(multi)?(set|map)|bitset|u?(int|float)\d*)\b/;

  // token style names.  correspond to css classes
  /**
   * token style for a string literal
   * @const
   */
  var PR_STRING = 'str';
  /**
   * token style for a keyword
   * @const
   */
  var PR_KEYWORD = 'kwd';
  /**
   * token style for a comment
   * @const
   */
  var PR_COMMENT = 'com';
  /**
   * token style for a type
   * @const
   */
  var PR_TYPE = 'typ';
  /**
   * token style for a literal value.  e.g. 1, null, true.
   * @const
   */
  var PR_LITERAL = 'lit';
  /**
   * token style for a punctuation string.
   * @const
   */
  var PR_PUNCTUATION = 'pun';
  /**
   * token style for plain text.
   * @const
   */
  var PR_PLAIN = 'pln';

  /**
   * token style for an sgml tag.
   * @const
   */
  var PR_TAG = 'tag';
  /**
   * token style for a markup declaration such as a DOCTYPE.
   * @const
   */
  var PR_DECLARATION = 'dec';
  /**
   * token style for embedded source.
   * @const
   */
  var PR_SOURCE = 'src';
  /**
   * token style for an sgml attribute name.
   * @const
   */
  var PR_ATTRIB_NAME = 'atn';
  /**
   * token style for an sgml attribute value.
   * @const
   */
  var PR_ATTRIB_VALUE = 'atv';

  /**
   * A class that indicates a section of markup that is not code, e.g. to allow
   * embedding of line numbers within code listings.
   * @const
   */
  var PR_NOCODE = 'nocode';

  
  
  /**
   * A set of tokens that can precede a regular expression literal in
   * javascript
   * http://web.archive.org/web/20070717142515/http://www.mozilla.org/js/language/js20/rationale/syntax.html
   * has the full list, but I've removed ones that might be problematic when
   * seen in languages that don't support regular expression literals.
   *
   * <p>Specifically, I've removed any keywords that can't precede a regexp
   * literal in a syntactically legal javascript program, and I've removed the
   * "in" keyword since it's not a keyword in many languages, and might be used
   * as a count of inches.
   *
   * <p>The link above does not accurately describe EcmaScript rules since
   * it fails to distinguish between (a=++/b/i) and (a++/b/i) but it works
   * very well in practice.
   *
   * @private
   * @const
   */
  var REGEXP_PRECEDER_PATTERN = '(?:^^\\.?|[+-]|[!=]=?=?|\\#|%=?|&&?=?|\\(|\\*=?|[+\\-]=|->|\\/=?|::?|<<?=?|>>?>?=?|,|;|\\?|@|\\[|~|{|\\^\\^?=?|\\|\\|?=?|break|case|continue|delete|do|else|finally|instanceof|return|throw|try|typeof)\\s*';
  
  // CAVEAT: this does not properly handle the case where a regular
  // expression immediately follows another since a regular expression may
  // have flags for case-sensitivity and the like.  Having regexp tokens
  // adjacent is not valid in any language I'm aware of, so I'm punting.
  // TODO: maybe style special characters inside a regexp as punctuation.

  /**
   * Given a group of {@link RegExp}s, returns a {@code RegExp} that globally
   * matches the union of the sets of strings matched by the input RegExp.
   * Since it matches globally, if the input strings have a start-of-input
   * anchor (/^.../), it is ignored for the purposes of unioning.
   * @param {Array.<RegExp>} regexs non multiline, non-global regexs.
   * @return {RegExp} a global regex.
   */
  function combinePrefixPatterns(regexs) {
    var capturedGroupIndex = 0;
  
    var needToFoldCase = false;
    var ignoreCase = false;
    for (var i = 0, n = regexs.length; i < n; ++i) {
      var regex = regexs[i];
      if (regex.ignoreCase) {
        ignoreCase = true;
      } else if (/[a-z]/i.test(regex.source.replace(
                     /\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[^ux]/gi, ''))) {
        needToFoldCase = true;
        ignoreCase = false;
        break;
      }
    }
  
    var escapeCharToCodeUnit = {
      'b': 8,
      't': 9,
      'n': 0xa,
      'v': 0xb,
      'f': 0xc,
      'r': 0xd
    };
  
    function decodeEscape(charsetPart) {
      var cc0 = charsetPart.charCodeAt(0);
      if (cc0 !== 92 /* \\ */) {
        return cc0;
      }
      var c1 = charsetPart.charAt(1);
      cc0 = escapeCharToCodeUnit[c1];
      if (cc0) {
        return cc0;
      } else if ('0' <= c1 && c1 <= '7') {
        return parseInt(charsetPart.substring(1), 8);
      } else if (c1 === 'u' || c1 === 'x') {
        return parseInt(charsetPart.substring(2), 16);
      } else {
        return charsetPart.charCodeAt(1);
      }
    }
  
    function encodeEscape(charCode) {
      if (charCode < 0x20) {
        return (charCode < 0x10 ? '\\x0' : '\\x') + charCode.toString(16);
      }
      var ch = String.fromCharCode(charCode);
      return (ch === '\\' || ch === '-' || ch === ']' || ch === '^')
          ? "\\" + ch : ch;
    }
  
    function caseFoldCharset(charSet) {
      var charsetParts = charSet.substring(1, charSet.length - 1).match(
          new RegExp(
              '\\\\u[0-9A-Fa-f]{4}'
              + '|\\\\x[0-9A-Fa-f]{2}'
              + '|\\\\[0-3][0-7]{0,2}'
              + '|\\\\[0-7]{1,2}'
              + '|\\\\[\\s\\S]'
              + '|-'
              + '|[^-\\\\]',
              'g'));
      var ranges = [];
      var inverse = charsetParts[0] === '^';
  
      var out = ['['];
      if (inverse) { out.push('^'); }
  
      for (var i = inverse ? 1 : 0, n = charsetParts.length; i < n; ++i) {
        var p = charsetParts[i];
        if (/\\[bdsw]/i.test(p)) {  // Don't muck with named groups.
          out.push(p);
        } else {
          var start = decodeEscape(p);
          var end;
          if (i + 2 < n && '-' === charsetParts[i + 1]) {
            end = decodeEscape(charsetParts[i + 2]);
            i += 2;
          } else {
            end = start;
          }
          ranges.push([start, end]);
          // If the range might intersect letters, then expand it.
          // This case handling is too simplistic.
          // It does not deal with non-latin case folding.
          // It works for latin source code identifiers though.
          if (!(end < 65 || start > 122)) {
            if (!(end < 65 || start > 90)) {
              ranges.push([Math.max(65, start) | 32, Math.min(end, 90) | 32]);
            }
            if (!(end < 97 || start > 122)) {
              ranges.push([Math.max(97, start) & ~32, Math.min(end, 122) & ~32]);
            }
          }
        }
      }
  
      // [[1, 10], [3, 4], [8, 12], [14, 14], [16, 16], [17, 17]]
      // -> [[1, 12], [14, 14], [16, 17]]
      ranges.sort(function (a, b) { return (a[0] - b[0]) || (b[1]  - a[1]); });
      var consolidatedRanges = [];
      var lastRange = [];
      for (var i = 0; i < ranges.length; ++i) {
        var range = ranges[i];
        if (range[0] <= lastRange[1] + 1) {
          lastRange[1] = Math.max(lastRange[1], range[1]);
        } else {
          consolidatedRanges.push(lastRange = range);
        }
      }
  
      for (var i = 0; i < consolidatedRanges.length; ++i) {
        var range = consolidatedRanges[i];
        out.push(encodeEscape(range[0]));
        if (range[1] > range[0]) {
          if (range[1] + 1 > range[0]) { out.push('-'); }
          out.push(encodeEscape(range[1]));
        }
      }
      out.push(']');
      return out.join('');
    }
  
    function allowAnywhereFoldCaseAndRenumberGroups(regex) {
      // Split into character sets, escape sequences, punctuation strings
      // like ('(', '(?:', ')', '^'), and runs of characters that do not
      // include any of the above.
      var parts = regex.source.match(
          new RegExp(
              '(?:'
              + '\\[(?:[^\\x5C\\x5D]|\\\\[\\s\\S])*\\]'  // a character set
              + '|\\\\u[A-Fa-f0-9]{4}'  // a unicode escape
              + '|\\\\x[A-Fa-f0-9]{2}'  // a hex escape
              + '|\\\\[0-9]+'  // a back-reference or octal escape
              + '|\\\\[^ux0-9]'  // other escape sequence
              + '|\\(\\?[:!=]'  // start of a non-capturing group
              + '|[\\(\\)\\^]'  // start/end of a group, or line start
              + '|[^\\x5B\\x5C\\(\\)\\^]+'  // run of other characters
              + ')',
              'g'));
      var n = parts.length;
  
      // Maps captured group numbers to the number they will occupy in
      // the output or to -1 if that has not been determined, or to
      // undefined if they need not be capturing in the output.
      var capturedGroups = [];
  
      // Walk over and identify back references to build the capturedGroups
      // mapping.
      for (var i = 0, groupIndex = 0; i < n; ++i) {
        var p = parts[i];
        if (p === '(') {
          // groups are 1-indexed, so max group index is count of '('
          ++groupIndex;
        } else if ('\\' === p.charAt(0)) {
          var decimalValue = +p.substring(1);
          if (decimalValue) {
            if (decimalValue <= groupIndex) {
              capturedGroups[decimalValue] = -1;
            } else {
              // Replace with an unambiguous escape sequence so that
              // an octal escape sequence does not turn into a backreference
              // to a capturing group from an earlier regex.
              parts[i] = encodeEscape(decimalValue);
            }
          }
        }
      }
  
      // Renumber groups and reduce capturing groups to non-capturing groups
      // where possible.
      for (var i = 1; i < capturedGroups.length; ++i) {
        if (-1 === capturedGroups[i]) {
          capturedGroups[i] = ++capturedGroupIndex;
        }
      }
      for (var i = 0, groupIndex = 0; i < n; ++i) {
        var p = parts[i];
        if (p === '(') {
          ++groupIndex;
          if (!capturedGroups[groupIndex]) {
            parts[i] = '(?:';
          }
        } else if ('\\' === p.charAt(0)) {
          var decimalValue = +p.substring(1);
          if (decimalValue && decimalValue <= groupIndex) {
            parts[i] = '\\' + capturedGroups[decimalValue];
          }
        }
      }
  
      // Remove any prefix anchors so that the output will match anywhere.
      // ^^ really does mean an anchored match though.
      for (var i = 0; i < n; ++i) {
        if ('^' === parts[i] && '^' !== parts[i + 1]) { parts[i] = ''; }
      }
  
      // Expand letters to groups to handle mixing of case-sensitive and
      // case-insensitive patterns if necessary.
      if (regex.ignoreCase && needToFoldCase) {
        for (var i = 0; i < n; ++i) {
          var p = parts[i];
          var ch0 = p.charAt(0);
          if (p.length >= 2 && ch0 === '[') {
            parts[i] = caseFoldCharset(p);
          } else if (ch0 !== '\\') {
            // TODO: handle letters in numeric escapes.
            parts[i] = p.replace(
                /[a-zA-Z]/g,
                function (ch) {
                  var cc = ch.charCodeAt(0);
                  return '[' + String.fromCharCode(cc & ~32, cc | 32) + ']';
                });
          }
        }
      }
  
      return parts.join('');
    }
  
    var rewritten = [];
    for (var i = 0, n = regexs.length; i < n; ++i) {
      var regex = regexs[i];
      if (regex.global || regex.multiline) { throw new Error('' + regex); }
      rewritten.push(
          '(?:' + allowAnywhereFoldCaseAndRenumberGroups(regex) + ')');
    }
  
    return new RegExp(rewritten.join('|'), ignoreCase ? 'gi' : 'g');
  }

  /**
   * Split markup into a string of source code and an array mapping ranges in
   * that string to the text nodes in which they appear.
   *
   * <p>
   * The HTML DOM structure:</p>
   * <pre>
   * (Element   "p"
   *   (Element "b"
   *     (Text  "print "))       ; #1
   *   (Text    "'Hello '")      ; #2
   *   (Element "br")            ; #3
   *   (Text    "  + 'World';")) ; #4
   * </pre>
   * <p>
   * corresponds to the HTML
   * {@code <p><b>print </b>'Hello '<br>  + 'World';</p>}.</p>
   *
   * <p>
   * It will produce the output:</p>
   * <pre>
   * {
   *   sourceCode: "print 'Hello '\n  + 'World';",
   *   //                     1          2
   *   //           012345678901234 5678901234567
   *   spans: [0, #1, 6, #2, 14, #3, 15, #4]
   * }
   * </pre>
   * <p>
   * where #1 is a reference to the {@code "print "} text node above, and so
   * on for the other text nodes.
   * </p>
   *
   * <p>
   * The {@code} spans array is an array of pairs.  Even elements are the start
   * indices of substrings, and odd elements are the text nodes (or BR elements)
   * that contain the text for those substrings.
   * Substrings continue until the next index or the end of the source.
   * </p>
   *
   * @param {Node} node an HTML DOM subtree containing source-code.
   * @param {boolean} isPreformatted true if white-space in text nodes should
   *    be considered significant.
   * @return {Object} source code and the text nodes in which they occur.
   */
  function extractSourceSpans(node, isPreformatted) {
    var nocode = /(?:^|\s)nocode(?:\s|$)/;
  
    var chunks = [];
    var length = 0;
    var spans = [];
    var k = 0;
  
    function walk(node) {
      var type = node.nodeType;
      if (type == 1) {  // Element
        if (nocode.test(node.className)) { return; }
        for (var child = node.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
        var nodeName = node.nodeName.toLowerCase();
        if ('br' === nodeName || 'li' === nodeName) {
          chunks[k] = '\n';
          spans[k << 1] = length++;
          spans[(k++ << 1) | 1] = node;
        }
      } else if (type == 3 || type == 4) {  // Text
        var text = node.nodeValue;
        if (text.length) {
          if (!isPreformatted) {
            text = text.replace(/[ \t\r\n]+/g, ' ');
          } else {
            text = text.replace(/\r\n?/g, '\n');  // Normalize newlines.
          }
          // TODO: handle tabs here?
          chunks[k] = text;
          spans[k << 1] = length;
          length += text.length;
          spans[(k++ << 1) | 1] = node;
        }
      }
    }
  
    walk(node);
  
    return {
      sourceCode: chunks.join('').replace(/\n$/, ''),
      spans: spans
    };
  }

  /**
   * Apply the given language handler to sourceCode and add the resulting
   * decorations to out.
   * @param {number} basePos the index of sourceCode within the chunk of source
   *    whose decorations are already present on out.
   */
  function appendDecorations(basePos, sourceCode, langHandler, out) {
    if (!sourceCode) { return; }
    var job = {
      sourceCode: sourceCode,
      basePos: basePos
    };
    langHandler(job);
    out.push.apply(out, job.decorations);
  }

  var notWs = /\S/;

  /**
   * Given an element, if it contains only one child element and any text nodes
   * it contains contain only space characters, return the sole child element.
   * Otherwise returns undefined.
   * <p>
   * This is meant to return the CODE element in {@code <pre><code ...>} when
   * there is a single child element that contains all the non-space textual
   * content, but not to return anything where there are multiple child elements
   * as in {@code <pre><code>...</code><code>...</code></pre>} or when there
   * is textual content.
   */
  function childContentWrapper(element) {
    var wrapper = undefined;
    for (var c = element.firstChild; c; c = c.nextSibling) {
      var type = c.nodeType;
      wrapper = (type === 1)  // Element Node
          ? (wrapper ? element : c)
          : (type === 3)  // Text Node
          ? (notWs.test(c.nodeValue) ? element : wrapper)
          : wrapper;
    }
    return wrapper === element ? undefined : wrapper;
  }

  /** Given triples of [style, pattern, context] returns a lexing function,
    * The lexing function interprets the patterns to find token boundaries and
    * returns a decoration list of the form
    * [index_0, style_0, index_1, style_1, ..., index_n, style_n]
    * where index_n is an index into the sourceCode, and style_n is a style
    * constant like PR_PLAIN.  index_n-1 <= index_n, and style_n-1 applies to
    * all characters in sourceCode[index_n-1:index_n].
    *
    * The stylePatterns is a list whose elements have the form
    * [style : string, pattern : RegExp, DEPRECATED, shortcut : string].
    *
    * Style is a style constant like PR_PLAIN, or can be a string of the
    * form 'lang-FOO', where FOO is a language extension describing the
    * language of the portion of the token in $1 after pattern executes.
    * E.g., if style is 'lang-lisp', and group 1 contains the text
    * '(hello (world))', then that portion of the token will be passed to the
    * registered lisp handler for formatting.
    * The text before and after group 1 will be restyled using this decorator
    * so decorators should take care that this doesn't result in infinite
    * recursion.  For example, the HTML lexer rule for SCRIPT elements looks
    * something like ['lang-js', /<[s]cript>(.+?)<\/script>/].  This may match
    * '<script>foo()<\/script>', which would cause the current decorator to
    * be called with '<script>' which would not match the same rule since
    * group 1 must not be empty, so it would be instead styled as PR_TAG by
    * the generic tag rule.  The handler registered for the 'js' extension would
    * then be called with 'foo()', and finally, the current decorator would
    * be called with '<\/script>' which would not match the original rule and
    * so the generic tag rule would identify it as a tag.
    *
    * Pattern must only match prefixes, and if it matches a prefix, then that
    * match is considered a token with the same style.
    *
    * Context is applied to the last non-whitespace, non-comment token
    * recognized.
    *
    * Shortcut is an optional string of characters, any of which, if the first
    * character, gurantee that this pattern and only this pattern matches.
    *
    * @param {Array} shortcutStylePatterns patterns that always start with
    *   a known character.  Must have a shortcut string.
    * @param {Array} fallthroughStylePatterns patterns that will be tried in
    *   order if the shortcut ones fail.  May have shortcuts.
    *
    * @return {function (Object)} a
    *   function that takes source code and returns a list of decorations.
    */
  function createSimpleLexer(shortcutStylePatterns, fallthroughStylePatterns) {
    var shortcuts = {};
    var tokenizer;
    (function () {
      var allPatterns = shortcutStylePatterns.concat(fallthroughStylePatterns);
      var allRegexs = [];
      var regexKeys = {};
      for (var i = 0, n = allPatterns.length; i < n; ++i) {
        var patternParts = allPatterns[i];
        var shortcutChars = patternParts[3];
        if (shortcutChars) {
          for (var c = shortcutChars.length; --c >= 0;) {
            shortcuts[shortcutChars.charAt(c)] = patternParts;
          }
        }
        var regex = patternParts[1];
        var k = '' + regex;
        if (!regexKeys.hasOwnProperty(k)) {
          allRegexs.push(regex);
          regexKeys[k] = null;
        }
      }
      allRegexs.push(/[\0-\uffff]/);
      tokenizer = combinePrefixPatterns(allRegexs);
    })();

    var nPatterns = fallthroughStylePatterns.length;

    /**
     * Lexes job.sourceCode and produces an output array job.decorations of
     * style classes preceded by the position at which they start in
     * job.sourceCode in order.
     *
     * @param {Object} job an object like <pre>{
     *    sourceCode: {string} sourceText plain text,
     *    basePos: {int} position of job.sourceCode in the larger chunk of
     *        sourceCode.
     * }</pre>
     */
    var decorate = function (job) {
      var sourceCode = job.sourceCode, basePos = job.basePos;
      /** Even entries are positions in source in ascending order.  Odd enties
        * are style markers (e.g., PR_COMMENT) that run from that position until
        * the end.
        * @type {Array.<number|string>}
        */
      var decorations = [basePos, PR_PLAIN];
      var pos = 0;  // index into sourceCode
      var tokens = sourceCode.match(tokenizer) || [];
      var styleCache = {};

      for (var ti = 0, nTokens = tokens.length; ti < nTokens; ++ti) {
        var token = tokens[ti];
        var style = styleCache[token];
        var match = void 0;

        var isEmbedded;
        if (typeof style === 'string') {
          isEmbedded = false;
        } else {
          var patternParts = shortcuts[token.charAt(0)];
          if (patternParts) {
            match = token.match(patternParts[1]);
            style = patternParts[0];
          } else {
            for (var i = 0; i < nPatterns; ++i) {
              patternParts = fallthroughStylePatterns[i];
              match = token.match(patternParts[1]);
              if (match) {
                style = patternParts[0];
                break;
              }
            }

            if (!match) {  // make sure that we make progress
              style = PR_PLAIN;
            }
          }

          isEmbedded = style.length >= 5 && 'lang-' === style.substring(0, 5);
          if (isEmbedded && !(match && typeof match[1] === 'string')) {
            isEmbedded = false;
            style = PR_SOURCE;
          }

          if (!isEmbedded) { styleCache[token] = style; }
        }

        var tokenStart = pos;
        pos += token.length;

        if (!isEmbedded) {
          decorations.push(basePos + tokenStart, style);
        } else {  // Treat group 1 as an embedded block of source code.
          var embeddedSource = match[1];
          var embeddedSourceStart = token.indexOf(embeddedSource);
          var embeddedSourceEnd = embeddedSourceStart + embeddedSource.length;
          if (match[2]) {
            // If embeddedSource can be blank, then it would match at the
            // beginning which would cause us to infinitely recurse on the
            // entire token, so we catch the right context in match[2].
            embeddedSourceEnd = token.length - match[2].length;
            embeddedSourceStart = embeddedSourceEnd - embeddedSource.length;
          }
          var lang = style.substring(5);
          // Decorate the left of the embedded source
          appendDecorations(
              basePos + tokenStart,
              token.substring(0, embeddedSourceStart),
              decorate, decorations);
          // Decorate the embedded source
          appendDecorations(
              basePos + tokenStart + embeddedSourceStart,
              embeddedSource,
              langHandlerForExtension(lang, embeddedSource),
              decorations);
          // Decorate the right of the embedded section
          appendDecorations(
              basePos + tokenStart + embeddedSourceEnd,
              token.substring(embeddedSourceEnd),
              decorate, decorations);
        }
      }
      job.decorations = decorations;
    };
    return decorate;
  }

  /** returns a function that produces a list of decorations from source text.
    *
    * This code treats ", ', and ` as string delimiters, and \ as a string
    * escape.  It does not recognize perl's qq() style strings.
    * It has no special handling for double delimiter escapes as in basic, or
    * the tripled delimiters used in python, but should work on those regardless
    * although in those cases a single string literal may be broken up into
    * multiple adjacent string literals.
    *
    * It recognizes C, C++, and shell style comments.
    *
    * @param {Object} options a set of optional parameters.
    * @return {function (Object)} a function that examines the source code
    *     in the input job and builds the decoration list.
    */
  function sourceDecorator(options) {
    var shortcutStylePatterns = [], fallthroughStylePatterns = [];
    if (options['tripleQuotedStrings']) {
      // '''multi-line-string''', 'single-line-string', and double-quoted
      shortcutStylePatterns.push(
          [PR_STRING,  /^(?:\'\'\'(?:[^\'\\]|\\[\s\S]|\'{1,2}(?=[^\']))*(?:\'\'\'|$)|\"\"\"(?:[^\"\\]|\\[\s\S]|\"{1,2}(?=[^\"]))*(?:\"\"\"|$)|\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$))/,
           null, '\'"']);
    } else if (options['multiLineStrings']) {
      // 'multi-line-string', "multi-line-string"
      shortcutStylePatterns.push(
          [PR_STRING,  /^(?:\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$)|\`(?:[^\\\`]|\\[\s\S])*(?:\`|$))/,
           null, '\'"`']);
    } else {
      // 'single-line-string', "single-line-string"
      shortcutStylePatterns.push(
          [PR_STRING,
           /^(?:\'(?:[^\\\'\r\n]|\\.)*(?:\'|$)|\"(?:[^\\\"\r\n]|\\.)*(?:\"|$))/,
           null, '"\'']);
    }
    if (options['verbatimStrings']) {
      // verbatim-string-literal production from the C# grammar.  See issue 93.
      fallthroughStylePatterns.push(
          [PR_STRING, /^@\"(?:[^\"]|\"\")*(?:\"|$)/, null]);
    }
    var hc = options['hashComments'];
    if (hc) {
      if (options['cStyleComments']) {
        if (hc > 1) {  // multiline hash comments
          shortcutStylePatterns.push(
              [PR_COMMENT, /^#(?:##(?:[^#]|#(?!##))*(?:###|$)|.*)/, null, '#']);
        } else {
          // Stop C preprocessor declarations at an unclosed open comment
          shortcutStylePatterns.push(
              [PR_COMMENT, /^#(?:(?:define|e(?:l|nd)if|else|error|ifn?def|include|line|pragma|undef|warning)\b|[^\r\n]*)/,
               null, '#']);
        }
        // #include <stdio.h>
        fallthroughStylePatterns.push(
            [PR_STRING,
             /^<(?:(?:(?:\.\.\/)*|\/?)(?:[\w-]+(?:\/[\w-]+)+)?[\w-]+\.h(?:h|pp|\+\+)?|[a-z]\w*)>/,
             null]);
      } else {
        shortcutStylePatterns.push([PR_COMMENT, /^#[^\r\n]*/, null, '#']);
      }
    }
    if (options['cStyleComments']) {
      fallthroughStylePatterns.push([PR_COMMENT, /^\/\/[^\r\n]*/, null]);
      fallthroughStylePatterns.push(
          [PR_COMMENT, /^\/\*[\s\S]*?(?:\*\/|$)/, null]);
    }
    var regexLiterals = options['regexLiterals'];
    if (regexLiterals) {
      /**
       * @const
       */
      var regexExcls = regexLiterals > 1
        ? ''  // Multiline regex literals
        : '\n\r';
      /**
       * @const
       */
      var regexAny = regexExcls ? '.' : '[\\S\\s]';
      /**
       * @const
       */
      var REGEX_LITERAL = (
          // A regular expression literal starts with a slash that is
          // not followed by * or / so that it is not confused with
          // comments.
          '/(?=[^/*' + regexExcls + '])'
          // and then contains any number of raw characters,
          + '(?:[^/\\x5B\\x5C' + regexExcls + ']'
          // escape sequences (\x5C),
          +    '|\\x5C' + regexAny
          // or non-nesting character sets (\x5B\x5D);
          +    '|\\x5B(?:[^\\x5C\\x5D' + regexExcls + ']'
          +             '|\\x5C' + regexAny + ')*(?:\\x5D|$))+'
          // finally closed by a /.
          + '/');
      fallthroughStylePatterns.push(
          ['lang-regex',
           RegExp('^' + REGEXP_PRECEDER_PATTERN + '(' + REGEX_LITERAL + ')')
           ]);
    }

    var types = options['types'];
    if (types) {
      fallthroughStylePatterns.push([PR_TYPE, types]);
    }

    var keywords = ("" + options['keywords']).replace(/^ | $/g, '');
    if (keywords.length) {
      fallthroughStylePatterns.push(
          [PR_KEYWORD,
           new RegExp('^(?:' + keywords.replace(/[\s,]+/g, '|') + ')\\b'),
           null]);
    }

    shortcutStylePatterns.push([PR_PLAIN,       /^\s+/, null, ' \r\n\t\xA0']);

    var punctuation =
      // The Bash man page says

      // A word is a sequence of characters considered as a single
      // unit by GRUB. Words are separated by metacharacters,
      // which are the following plus space, tab, and newline: { }
      // | & $ ; < >
      // ...
      
      // A word beginning with # causes that word and all remaining
      // characters on that line to be ignored.

      // which means that only a '#' after /(?:^|[{}|&$;<>\s])/ starts a
      // comment but empirically
      // $ echo {#}
      // {#}
      // $ echo \$#
      // $#
      // $ echo }#
      // }#

      // so /(?:^|[|&;<>\s])/ is more appropriate.

      // http://gcc.gnu.org/onlinedocs/gcc-2.95.3/cpp_1.html#SEC3
      // suggests that this definition is compatible with a
      // default mode that tries to use a single token definition
      // to recognize both bash/python style comments and C
      // preprocessor directives.

      // This definition of punctuation does not include # in the list of
      // follow-on exclusions, so # will not be broken before if preceeded
      // by a punctuation character.  We could try to exclude # after
      // [|&;<>] but that doesn't seem to cause many major problems.
      // If that does turn out to be a problem, we should change the below
      // when hc is truthy to include # in the run of punctuation characters
      // only when not followint [|&;<>].
      '^.[^\\s\\w.$@\'"`/\\\\]*';
    if (options['regexLiterals']) {
      punctuation += '(?!\s*\/)';
    }

    fallthroughStylePatterns.push(
        // TODO(mikesamuel): recognize non-latin letters and numerals in idents
        [PR_LITERAL,     /^@[a-z_$][a-z_$@0-9]*/i, null],
        [PR_TYPE,        /^(?:[@_]?[A-Z]+[a-z][A-Za-z_$@0-9]*|\w+_t\b)/, null],
        [PR_PLAIN,       /^[a-z_$][a-z_$@0-9]*/i, null],
        [PR_LITERAL,
         new RegExp(
             '^(?:'
             // A hex number
             + '0x[a-f0-9]+'
             // or an octal or decimal number,
             + '|(?:\\d(?:_\\d+)*\\d*(?:\\.\\d*)?|\\.\\d\\+)'
             // possibly in scientific notation
             + '(?:e[+\\-]?\\d+)?'
             + ')'
             // with an optional modifier like UL for unsigned long
             + '[a-z]*', 'i'),
         null, '0123456789'],
        // Don't treat escaped quotes in bash as starting strings.
        // See issue 144.
        [PR_PLAIN,       /^\\[\s\S]?/, null],
        [PR_PUNCTUATION, new RegExp(punctuation), null]);

    return createSimpleLexer(shortcutStylePatterns, fallthroughStylePatterns);
  }

  var decorateSource = sourceDecorator({
        'keywords': ALL_KEYWORDS,
        'hashComments': true,
        'cStyleComments': true,
        'multiLineStrings': true,
        'regexLiterals': true
      });

  /**
   * Given a DOM subtree, wraps it in a list, and puts each line into its own
   * list item.
   *
   * @param {Node} node modified in place.  Its content is pulled into an
   *     HTMLOListElement, and each line is moved into a separate list item.
   *     This requires cloning elements, so the input might not have unique
   *     IDs after numbering.
   * @param {boolean} isPreformatted true iff white-space in text nodes should
   *     be treated as significant.
   */
  function numberLines(node, opt_startLineNum, isPreformatted) {
    var nocode = /(?:^|\s)nocode(?:\s|$)/;
    var lineBreak = /\r\n?|\n/;
  
    var document = node.ownerDocument;
  
    var li = document.createElement('li');
    while (node.firstChild) {
      li.appendChild(node.firstChild);
    }
    // An array of lines.  We split below, so this is initialized to one
    // un-split line.
    var listItems = [li];
  
    function walk(node) {
      var type = node.nodeType;
      if (type == 1 && !nocode.test(node.className)) {  // Element
        if ('br' === node.nodeName) {
          breakAfter(node);
          // Discard the <BR> since it is now flush against a </LI>.
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        } else {
          for (var child = node.firstChild; child; child = child.nextSibling) {
            walk(child);
          }
        }
      } else if ((type == 3 || type == 4) && isPreformatted) {  // Text
        var text = node.nodeValue;
        var match = text.match(lineBreak);
        if (match) {
          var firstLine = text.substring(0, match.index);
          node.nodeValue = firstLine;
          var tail = text.substring(match.index + match[0].length);
          if (tail) {
            var parent = node.parentNode;
            parent.insertBefore(
              document.createTextNode(tail), node.nextSibling);
          }
          breakAfter(node);
          if (!firstLine) {
            // Don't leave blank text nodes in the DOM.
            node.parentNode.removeChild(node);
          }
        }
      }
    }
  
    // Split a line after the given node.
    function breakAfter(lineEndNode) {
      // If there's nothing to the right, then we can skip ending the line
      // here, and move root-wards since splitting just before an end-tag
      // would require us to create a bunch of empty copies.
      while (!lineEndNode.nextSibling) {
        lineEndNode = lineEndNode.parentNode;
        if (!lineEndNode) { return; }
      }
  
      function breakLeftOf(limit, copy) {
        // Clone shallowly if this node needs to be on both sides of the break.
        var rightSide = copy ? limit.cloneNode(false) : limit;
        var parent = limit.parentNode;
        if (parent) {
          // We clone the parent chain.
          // This helps us resurrect important styling elements that cross lines.
          // E.g. in <i>Foo<br>Bar</i>
          // should be rewritten to <li><i>Foo</i></li><li><i>Bar</i></li>.
          var parentClone = breakLeftOf(parent, 1);
          // Move the clone and everything to the right of the original
          // onto the cloned parent.
          var next = limit.nextSibling;
          parentClone.appendChild(rightSide);
          for (var sibling = next; sibling; sibling = next) {
            next = sibling.nextSibling;
            parentClone.appendChild(sibling);
          }
        }
        return rightSide;
      }
  
      var copiedListItem = breakLeftOf(lineEndNode.nextSibling, 0);
  
      // Walk the parent chain until we reach an unattached LI.
      for (var parent;
           // Check nodeType since IE invents document fragments.
           (parent = copiedListItem.parentNode) && parent.nodeType === 1;) {
        copiedListItem = parent;
      }
      // Put it on the list of lines for later processing.
      listItems.push(copiedListItem);
    }
  
    // Split lines while there are lines left to split.
    for (var i = 0;  // Number of lines that have been split so far.
         i < listItems.length;  // length updated by breakAfter calls.
         ++i) {
      walk(listItems[i]);
    }
  
    // Make sure numeric indices show correctly.
    if (opt_startLineNum === (opt_startLineNum|0)) {
      listItems[0].setAttribute('value', opt_startLineNum);
    }
  
    var ol = document.createElement('ol');
    ol.className = 'linenums';
    var offset = Math.max(0, ((opt_startLineNum - 1 /* zero index */)) | 0) || 0;
    for (var i = 0, n = listItems.length; i < n; ++i) {
      li = listItems[i];
      // Stick a class on the LIs so that stylesheets can
      // color odd/even rows, or any other row pattern that
      // is co-prime with 10.
      li.className = 'L' + ((i + offset) % 10);
      if (!li.firstChild) {
        li.appendChild(document.createTextNode('\xA0'));
      }
      ol.appendChild(li);
    }
  
    node.appendChild(ol);
  }
  /**
   * Breaks {@code job.sourceCode} around style boundaries in
   * {@code job.decorations} and modifies {@code job.sourceNode} in place.
   * @param {Object} job like <pre>{
   *    sourceCode: {string} source as plain text,
   *    sourceNode: {HTMLElement} the element containing the source,
   *    spans: {Array.<number|Node>} alternating span start indices into source
   *       and the text node or element (e.g. {@code <BR>}) corresponding to that
   *       span.
   *    decorations: {Array.<number|string} an array of style classes preceded
   *       by the position at which they start in job.sourceCode in order
   * }</pre>
   * @private
   */
  function recombineTagsAndDecorations(job) {
    var isIE8OrEarlier = /\bMSIE\s(\d+)/.exec(navigator.userAgent);
    isIE8OrEarlier = isIE8OrEarlier && +isIE8OrEarlier[1] <= 8;
    var newlineRe = /\n/g;
  
    var source = job.sourceCode;
    var sourceLength = source.length;
    // Index into source after the last code-unit recombined.
    var sourceIndex = 0;
  
    var spans = job.spans;
    var nSpans = spans.length;
    // Index into spans after the last span which ends at or before sourceIndex.
    var spanIndex = 0;
  
    var decorations = job.decorations;
    var nDecorations = decorations.length;
    // Index into decorations after the last decoration which ends at or before
    // sourceIndex.
    var decorationIndex = 0;
  
    // Remove all zero-length decorations.
    decorations[nDecorations] = sourceLength;
    var decPos, i;
    for (i = decPos = 0; i < nDecorations;) {
      if (decorations[i] !== decorations[i + 2]) {
        decorations[decPos++] = decorations[i++];
        decorations[decPos++] = decorations[i++];
      } else {
        i += 2;
      }
    }
    nDecorations = decPos;
  
    // Simplify decorations.
    for (i = decPos = 0; i < nDecorations;) {
      var startPos = decorations[i];
      // Conflate all adjacent decorations that use the same style.
      var startDec = decorations[i + 1];
      var end = i + 2;
      while (end + 2 <= nDecorations && decorations[end + 1] === startDec) {
        end += 2;
      }
      decorations[decPos++] = startPos;
      decorations[decPos++] = startDec;
      i = end;
    }
  
    nDecorations = decorations.length = decPos;
  
    var sourceNode = job.sourceNode;
    var oldDisplay;
    if (sourceNode) {
      oldDisplay = sourceNode.style.display;
      sourceNode.style.display = 'none';
    }
    try {
      var decoration = null;
      while (spanIndex < nSpans) {
        var spanStart = spans[spanIndex];
        var spanEnd = spans[spanIndex + 2] || sourceLength;
  
        var decEnd = decorations[decorationIndex + 2] || sourceLength;
  
        var end = Math.min(spanEnd, decEnd);
  
        var textNode = spans[spanIndex + 1];
        var styledText;
        if (textNode.nodeType !== 1  // Don't muck with <BR>s or <LI>s
            // Don't introduce spans around empty text nodes.
            && (styledText = source.substring(sourceIndex, end))) {
          // This may seem bizarre, and it is.  Emitting LF on IE causes the
          // code to display with spaces instead of line breaks.
          // Emitting Windows standard issue linebreaks (CRLF) causes a blank
          // space to appear at the beginning of every line but the first.
          // Emitting an old Mac OS 9 line separator makes everything spiffy.
          if (isIE8OrEarlier) {
            styledText = styledText.replace(newlineRe, '\r');
          }
          textNode.nodeValue = styledText;
          var document = textNode.ownerDocument;
          var span = document.createElement('span');
          span.className = decorations[decorationIndex + 1];
          var parentNode = textNode.parentNode;
          parentNode.replaceChild(span, textNode);
          span.appendChild(textNode);
          if (sourceIndex < spanEnd) {  // Split off a text node.
            spans[spanIndex + 1] = textNode
                // TODO: Possibly optimize by using '' if there's no flicker.
                = document.createTextNode(source.substring(end, spanEnd));
            parentNode.insertBefore(textNode, span.nextSibling);
          }
        }
  
        sourceIndex = end;
  
        if (sourceIndex >= spanEnd) {
          spanIndex += 2;
        }
        if (sourceIndex >= decEnd) {
          decorationIndex += 2;
        }
      }
    } finally {
      if (sourceNode) {
        sourceNode.style.display = oldDisplay;
      }
    }
  }

  /** Maps language-specific file extensions to handlers. */
  var langHandlerRegistry = {};
  /** Register a language handler for the given file extensions.
    * @param {function (Object)} handler a function from source code to a list
    *      of decorations.  Takes a single argument job which describes the
    *      state of the computation.   The single parameter has the form
    *      {@code {
    *        sourceCode: {string} as plain text.
    *        decorations: {Array.<number|string>} an array of style classes
    *                     preceded by the position at which they start in
    *                     job.sourceCode in order.
    *                     The language handler should assigned this field.
    *        basePos: {int} the position of source in the larger source chunk.
    *                 All positions in the output decorations array are relative
    *                 to the larger source chunk.
    *      } }
    * @param {Array.<string>} fileExtensions
    */
  function registerLangHandler(handler, fileExtensions) {
    for (var i = fileExtensions.length; --i >= 0;) {
      var ext = fileExtensions[i];
      if (!langHandlerRegistry.hasOwnProperty(ext)) {
        langHandlerRegistry[ext] = handler;
      } else if (win['console']) {
        console['warn']('cannot override language handler %s', ext);
      }
    }
  }
  function langHandlerForExtension(extension, source) {
    if (!(extension && langHandlerRegistry.hasOwnProperty(extension))) {
      // Treat it as markup if the first non whitespace character is a < and
      // the last non-whitespace character is a >.
      extension = /^\s*</.test(source)
          ? 'default-markup'
          : 'default-code';
    }
    return langHandlerRegistry[extension];
  }
  registerLangHandler(decorateSource, ['default-code']);
  registerLangHandler(
      createSimpleLexer(
          [],
          [
           [PR_PLAIN,       /^[^<?]+/],
           [PR_DECLARATION, /^<!\w[^>]*(?:>|$)/],
           [PR_COMMENT,     /^<\!--[\s\S]*?(?:-\->|$)/],
           // Unescaped content in an unknown language
           ['lang-',        /^<\?([\s\S]+?)(?:\?>|$)/],
           ['lang-',        /^<%([\s\S]+?)(?:%>|$)/],
           [PR_PUNCTUATION, /^(?:<[%?]|[%?]>)/],
           ['lang-',        /^<xmp\b[^>]*>([\s\S]+?)<\/xmp\b[^>]*>/i],
           // Unescaped content in javascript.  (Or possibly vbscript).
           ['lang-js',      /^<script\b[^>]*>([\s\S]*?)(<\/script\b[^>]*>)/i],
           // Contains unescaped stylesheet content
           ['lang-css',     /^<style\b[^>]*>([\s\S]*?)(<\/style\b[^>]*>)/i],
           ['lang-in.tag',  /^(<\/?[a-z][^<>]*>)/i]
          ]),
      ['default-markup', 'htm', 'html', 'mxml', 'xhtml', 'xml', 'xsl']);
  registerLangHandler(
      createSimpleLexer(
          [
           [PR_PLAIN,        /^[\s]+/, null, ' \t\r\n'],
           [PR_ATTRIB_VALUE, /^(?:\"[^\"]*\"?|\'[^\']*\'?)/, null, '\"\'']
           ],
          [
           [PR_TAG,          /^^<\/?[a-z](?:[\w.:-]*\w)?|\/?>$/i],
           [PR_ATTRIB_NAME,  /^(?!style[\s=]|on)[a-z](?:[\w:-]*\w)?/i],
           ['lang-uq.val',   /^=\s*([^>\'\"\s]*(?:[^>\'\"\s\/]|\/(?=\s)))/],
           [PR_PUNCTUATION,  /^[=<>\/]+/],
           ['lang-js',       /^on\w+\s*=\s*\"([^\"]+)\"/i],
           ['lang-js',       /^on\w+\s*=\s*\'([^\']+)\'/i],
           ['lang-js',       /^on\w+\s*=\s*([^\"\'>\s]+)/i],
           ['lang-css',      /^style\s*=\s*\"([^\"]+)\"/i],
           ['lang-css',      /^style\s*=\s*\'([^\']+)\'/i],
           ['lang-css',      /^style\s*=\s*([^\"\'>\s]+)/i]
           ]),
      ['in.tag']);
  registerLangHandler(
      createSimpleLexer([], [[PR_ATTRIB_VALUE, /^[\s\S]+/]]), ['uq.val']);
  registerLangHandler(sourceDecorator({
          'keywords': CPP_KEYWORDS,
          'hashComments': true,
          'cStyleComments': true,
          'types': C_TYPES
        }), ['c', 'cc', 'cpp', 'cxx', 'cyc', 'm']);
  registerLangHandler(sourceDecorator({
          'keywords': 'null,true,false'
        }), ['json']);
  registerLangHandler(sourceDecorator({
          'keywords': CSHARP_KEYWORDS,
          'hashComments': true,
          'cStyleComments': true,
          'verbatimStrings': true,
          'types': C_TYPES
        }), ['cs']);
  registerLangHandler(sourceDecorator({
          'keywords': JAVA_KEYWORDS,
          'cStyleComments': true
        }), ['java']);
  registerLangHandler(sourceDecorator({
          'keywords': SH_KEYWORDS,
          'hashComments': true,
          'multiLineStrings': true
        }), ['bash', 'bsh', 'csh', 'sh']);
  registerLangHandler(sourceDecorator({
          'keywords': PYTHON_KEYWORDS,
          'hashComments': true,
          'multiLineStrings': true,
          'tripleQuotedStrings': true
        }), ['cv', 'py', 'python']);
  registerLangHandler(sourceDecorator({
          'keywords': PERL_KEYWORDS,
          'hashComments': true,
          'multiLineStrings': true,
          'regexLiterals': 2  // multiline regex literals
        }), ['perl', 'pl', 'pm']);
  registerLangHandler(sourceDecorator({
          'keywords': RUBY_KEYWORDS,
          'hashComments': true,
          'multiLineStrings': true,
          'regexLiterals': true
        }), ['rb', 'ruby']);
  registerLangHandler(sourceDecorator({
          'keywords': JSCRIPT_KEYWORDS,
          'cStyleComments': true,
          'regexLiterals': true
        }), ['javascript', 'js']);
  registerLangHandler(sourceDecorator({
          'keywords': COFFEE_KEYWORDS,
          'hashComments': 3,  // ### style block comments
          'cStyleComments': true,
          'multilineStrings': true,
          'tripleQuotedStrings': true,
          'regexLiterals': true
        }), ['coffee']);
  registerLangHandler(sourceDecorator({
          'keywords': RUST_KEYWORDS,
          'cStyleComments': true,
          'multilineStrings': true
        }), ['rc', 'rs', 'rust']);
  registerLangHandler(
      createSimpleLexer([], [[PR_STRING, /^[\s\S]+/]]), ['regex']);

  function applyDecorator(job) {
    var opt_langExtension = job.langExtension;

    try {
      // Extract tags, and convert the source code to plain text.
      var sourceAndSpans = extractSourceSpans(job.sourceNode, job.pre);
      /** Plain text. @type {string} */
      var source = sourceAndSpans.sourceCode;
      job.sourceCode = source;
      job.spans = sourceAndSpans.spans;
      job.basePos = 0;

      // Apply the appropriate language handler
      langHandlerForExtension(opt_langExtension, source)(job);

      // Integrate the decorations and tags back into the source code,
      // modifying the sourceNode in place.
      recombineTagsAndDecorations(job);
    } catch (e) {
      if (win['console']) {
        console['log'](e && e['stack'] || e);
      }
    }
  }

  /**
   * Pretty print a chunk of code.
   * @param sourceCodeHtml {string} The HTML to pretty print.
   * @param opt_langExtension {string} The language name to use.
   *     Typically, a filename extension like 'cpp' or 'java'.
   * @param opt_numberLines {number|boolean} True to number lines,
   *     or the 1-indexed number of the first line in sourceCodeHtml.
   */
  function $prettyPrintOne(sourceCodeHtml, opt_langExtension, opt_numberLines) {
    var container = document.createElement('div');
    // This could cause images to load and onload listeners to fire.
    // E.g. <img onerror="alert(1337)" src="nosuchimage.png">.
    // We assume that the inner HTML is from a trusted source.
    // The pre-tag is required for IE8 which strips newlines from innerHTML
    // when it is injected into a <pre> tag.
    // http://stackoverflow.com/questions/451486/pre-tag-loses-line-breaks-when-setting-innerhtml-in-ie
    // http://stackoverflow.com/questions/195363/inserting-a-newline-into-a-pre-tag-ie-javascript
    container.innerHTML = '<pre>' + sourceCodeHtml + '</pre>';
    container = container.firstChild;
    if (opt_numberLines) {
      numberLines(container, opt_numberLines, true);
    }

    var job = {
      langExtension: opt_langExtension,
      numberLines: opt_numberLines,
      sourceNode: container,
      pre: 1
    };
    applyDecorator(job);
    return container.innerHTML;
  }

   /**
    * Find all the {@code <pre>} and {@code <code>} tags in the DOM with
    * {@code class=prettyprint} and prettify them.
    *
    * @param {Function} opt_whenDone called when prettifying is done.
    * @param {HTMLElement|HTMLDocument} opt_root an element or document
    *   containing all the elements to pretty print.
    *   Defaults to {@code document.body}.
    */
  function $prettyPrint(opt_whenDone, opt_root) {
    var root = opt_root || document.body;
    var doc = root.ownerDocument || document;
    function byTagName(tn) { return root.getElementsByTagName(tn); }
    // fetch a list of nodes to rewrite
    var codeSegments = [byTagName('pre'), byTagName('code'), byTagName('xmp')];
    var elements = [];
    for (var i = 0; i < codeSegments.length; ++i) {
      for (var j = 0, n = codeSegments[i].length; j < n; ++j) {
        elements.push(codeSegments[i][j]);
      }
    }
    codeSegments = null;

    var clock = Date;
    if (!clock['now']) {
      clock = { 'now': function () { return +(new Date); } };
    }

    // The loop is broken into a series of continuations to make sure that we
    // don't make the browser unresponsive when rewriting a large page.
    var k = 0;
    var prettyPrintingJob;

    var langExtensionRe = /\blang(?:uage)?-([\w.]+)(?!\S)/;
    var prettyPrintRe = /\bprettyprint\b/;
    var prettyPrintedRe = /\bprettyprinted\b/;
    var preformattedTagNameRe = /pre|xmp/i;
    var codeRe = /^code$/i;
    var preCodeXmpRe = /^(?:pre|code|xmp)$/i;
    var EMPTY = {};

    function doWork() {
      var endTime = (win['PR_SHOULD_USE_CONTINUATION'] ?
                     clock['now']() + 250 /* ms */ :
                     Infinity);
      for (; k < elements.length && clock['now']() < endTime; k++) {
        var cs = elements[k];

        // Look for a preceding comment like
        // <?prettify lang="..." linenums="..."?>
        var attrs = EMPTY;
        {
          for (var preceder = cs; (preceder = preceder.previousSibling);) {
            var nt = preceder.nodeType;
            // <?foo?> is parsed by HTML 5 to a comment node (8)
            // like <!--?foo?-->, but in XML is a processing instruction
            var value = (nt === 7 || nt === 8) && preceder.nodeValue;
            if (value
                ? !/^\??prettify\b/.test(value)
                : (nt !== 3 || /\S/.test(preceder.nodeValue))) {
              // Skip over white-space text nodes but not others.
              break;
            }
            if (value) {
              attrs = {};
              value.replace(
                  /\b(\w+)=([\w:.%+-]+)/g,
                function (_, name, value) { attrs[name] = value; });
              break;
            }
          }
        }

        var className = cs.className;
        if ((attrs !== EMPTY || prettyPrintRe.test(className))
            // Don't redo this if we've already done it.
            // This allows recalling pretty print to just prettyprint elements
            // that have been added to the page since last call.
            && !prettyPrintedRe.test(className)) {

          // make sure this is not nested in an already prettified element
          var nested = false;
          for (var p = cs.parentNode; p; p = p.parentNode) {
            var tn = p.tagName;
            if (preCodeXmpRe.test(tn)
                && p.className && prettyPrintRe.test(p.className)) {
              nested = true;
              break;
            }
          }
          if (!nested) {
            // Mark done.  If we fail to prettyprint for whatever reason,
            // we shouldn't try again.
            cs.className += ' prettyprinted';

            // If the classes includes a language extensions, use it.
            // Language extensions can be specified like
            //     <pre class="prettyprint lang-cpp">
            // the language extension "cpp" is used to find a language handler
            // as passed to PR.registerLangHandler.
            // HTML5 recommends that a language be specified using "language-"
            // as the prefix instead.  Google Code Prettify supports both.
            // http://dev.w3.org/html5/spec-author-view/the-code-element.html
            var langExtension = attrs['lang'];
            if (!langExtension) {
              langExtension = className.match(langExtensionRe);
              // Support <pre class="prettyprint"><code class="language-c">
              var wrapper;
              if (!langExtension && (wrapper = childContentWrapper(cs))
                  && codeRe.test(wrapper.tagName)) {
                langExtension = wrapper.className.match(langExtensionRe);
              }

              if (langExtension) { langExtension = langExtension[1]; }
            }

            var preformatted;
            if (preformattedTagNameRe.test(cs.tagName)) {
              preformatted = 1;
            } else {
              var currentStyle = cs['currentStyle'];
              var defaultView = doc.defaultView;
              var whitespace = (
                  currentStyle
                  ? currentStyle['whiteSpace']
                  : (defaultView
                     && defaultView.getComputedStyle)
                  ? defaultView.getComputedStyle(cs, null)
                  .getPropertyValue('white-space')
                  : 0);
              preformatted = whitespace
                  && 'pre' === whitespace.substring(0, 3);
            }

            // Look for a class like linenums or linenums:<n> where <n> is the
            // 1-indexed number of the first line.
            var lineNums = attrs['linenums'];
            if (!(lineNums = lineNums === 'true' || +lineNums)) {
              lineNums = className.match(/\blinenums\b(?::(\d+))?/);
              lineNums =
                lineNums
                ? lineNums[1] && lineNums[1].length
                  ? +lineNums[1] : true
                : false;
            }
            if (lineNums) { numberLines(cs, lineNums, preformatted); }

            // do the pretty printing
            prettyPrintingJob = {
              langExtension: langExtension,
              sourceNode: cs,
              numberLines: lineNums,
              pre: preformatted
            };
            applyDecorator(prettyPrintingJob);
          }
        }
      }
      if (k < elements.length) {
        // finish up in a continuation
        setTimeout(doWork, 250);
      } else if ('function' === typeof opt_whenDone) {
        opt_whenDone();
      }
    }

    doWork();
  }

  /**
   * Contains functions for creating and registering new language handlers.
   * @type {Object}
   */
  var PR = win['PR'] = {
        'createSimpleLexer': createSimpleLexer,
        'registerLangHandler': registerLangHandler,
        'sourceDecorator': sourceDecorator,
        'PR_ATTRIB_NAME': PR_ATTRIB_NAME,
        'PR_ATTRIB_VALUE': PR_ATTRIB_VALUE,
        'PR_COMMENT': PR_COMMENT,
        'PR_DECLARATION': PR_DECLARATION,
        'PR_KEYWORD': PR_KEYWORD,
        'PR_LITERAL': PR_LITERAL,
        'PR_NOCODE': PR_NOCODE,
        'PR_PLAIN': PR_PLAIN,
        'PR_PUNCTUATION': PR_PUNCTUATION,
        'PR_SOURCE': PR_SOURCE,
        'PR_STRING': PR_STRING,
        'PR_TAG': PR_TAG,
        'PR_TYPE': PR_TYPE,
        'prettyPrintOne':
           IN_GLOBAL_SCOPE
             ? (win['prettyPrintOne'] = $prettyPrintOne)
             : (prettyPrintOne = $prettyPrintOne),
        'prettyPrint': prettyPrint =
           IN_GLOBAL_SCOPE
             ? (win['prettyPrint'] = $prettyPrint)
             : (prettyPrint = $prettyPrint)
      };

  // Make PR available via the Asynchronous Module Definition (AMD) API.
  // Per https://github.com/amdjs/amdjs-api/wiki/AMD:
  // The Asynchronous Module Definition (AMD) API specifies a
  // mechanism for defining modules such that the module and its
  // dependencies can be asynchronously loaded.
  // ...
  // To allow a clear indicator that a global define function (as
  // needed for script src browser loading) conforms to the AMD API,
  // any global define function SHOULD have a property called "amd"
  // whose value is an object. This helps avoid conflict with any
  // other existing JavaScript code that could have defined a define()
  // function that does not conform to the AMD API.
  if (typeof define === "function" && define['amd']) {
    define("google-code-prettify", [], function () {
      return PR; 
    });
  }
})();


// Module core/highlight
// Does syntax highlighting to all pre and code that have a class of "highlight"

// A potential improvement would be to call cb() immediately and benefit from the asynchronous
// ability of prettyPrint() (but only call msg.pub() in the callback to remain accurate as to
// the end of processing)

define(
    'core/highlight',["text!core/css/highlight.css", "google-code-prettify"],
    function (css, PR) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/highlight");

                // fix old classes
                var oldies = "sh_css sh_html sh_javascript sh_javascript_dom sh_xml".split(" ");
                for (var i = 0, n = oldies.length; i < n; i++) {
                    var old = oldies[i];
                    $("." + old).each(function () {
                        $(this).removeClass(old).addClass("highlight");
                        msg.pub("warn", "Old highlighting class '" + old + "', use 'highlight' instead.");
                    });
                }

                // prettify
                var $highs = $("pre.highlight, code.highlight")
                ,   done = function () {
                        msg.pub("end", "core/highlight");
                        cb();
                    }
                ;
                if ($highs.length) {
                    if (!conf.noHighlightCSS) {
                        $(doc).find("head link").first().before($("<style/>").text(css));
                    }
                    $highs.addClass("prettyprint");
                    PR.prettyPrint(done);
                }
                else {
                    done();
                }
            }
        };
    }
);


define('text!core/css/bp.css',[],function () { return '/* --- Best Practices --- */\ndiv.practice {\n    border: solid #bebebe 1px;\n    margin: 2em 1em 1em 2em;\n}\n\nspan.practicelab {\n    margin: 1.5em 0.5em 1em 1em;\n    font-weight: bold;\n    font-style: italic;\n    background: #dfffff;\n    position: relative;\n    padding: 0 0.5em;\n    top: -1.5em;\n}\n\np.practicedesc {\n    margin: 1.5em 0.5em 1em 1em;\n}\n\n@media screen {\n    p.practicedesc {\n        position: relative;\n        top: -2em;\n        padding: 0;\n        margin: 1.5em 0.5em -1em 1em;\n    }\n}\n';});

/*globals define */
/*jshint browser:true, jquery:true */

// Module core/best-practices
// Handles the marking up of best practices, and can generate a summary of all of them.
// The summary is generated if there is a section in the document with ID bp-summary.
// Best practices are marked up with span.practicelab.

define(
    'core/best-practices',["text!core/css/bp.css"],
    function (css) {
        "use strict";
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/best-practices");
                var num = 0
                ,   $bps = $("span.practicelab", doc)
                ,   $content = $("<div><h2>Best Practices Summary</h2><ul></ul></div>")
                ,   $ul = $content.find("ul")
                ;
                $bps.each(function () {
                    var $bp = $(this), id = $bp.makeID("bp"), $li = $("<li><a></a></li>"), $a = $li.find("a");
                    num++;
                    $a.attr("href", "#" + id).text("Best Practice " + num);
                    $li.append(doc.createTextNode(": " + $bp.text()));
                    $ul.append($li);
                    $bp.prepend(doc.createTextNode("Best Practice " + num + ": "));
                });
                if ($bps.length) {
                    $(doc).find("head link").first().before($("<style/>").text(css));
                    if ($("#bp-summary")) $("#bp-summary").append($content.contents());
                }
                else if ($("#bp-summary").length) {
                    msg.pub("warn", "Using best practices summary (#bp-summary) but no best practices found.");
                    $("#bp-summary").remove();
                }

                msg.pub("end", "core/best-practices");
                cb();
            }
        };
    }
);

/*globals define*/

// Module core/figure
// Handles figures in the document. This encompasses two primary operations. One is
// converting some old syntax to use the new HTML5 figure and figcaption elements
// (this is undone by the unhtml5 plugin, but that will soon be phased out). The other
// is to enable the generation of a Table of Figures wherever there is a #tof element
// to be found as well as normalise the titles of figures.

define(
    'core/figures',["core/utils"],
    function (utils) {
        "use strict";
        var make_fig_num = function (fmt, doc, chapter, $cap, label, num) {
            //console.log("\n\nmake_"+label+"_num(fmt='" + fmt + "' chapter='" + chapter +"' $cap='" + $cap[0].outerHTML + "' label='" + label + "' num='" + num + "'");
            if (fmt === null || fmt === "" || fmt === "%t" || fmt === "%") {
                $cap.wrapInner($("<span class='" + label + "title'/>"));
                return num;
            }
            var $title = $cap.clone().renameElement("span").attr("class", label + "title");
            //console.log("title='" + $title[0].outerHTML + "'");
            var adjfmt = " " + fmt.replace(/%%/g, "%\\");
            var sfmt = adjfmt.split("%");
            var decoration_num = 1;
            var $cur = $("<span class='" + label + "decoration " + label + "decoration0'/>");
            $cap.html("");
            //console.log("$cap='" + $cap[0].outerHTML + "'");
            //console.log("fmt=\"" + adjfmt + "\"");
            var added = 0;
            for (var i = 0; i < sfmt.length; i++) {
                var s = sfmt[i];
                switch (s.substr(0,1)) {
                    case " ": break;
                    case "(":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "no'/>");
                        break;
                    case ")":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    case "\\":$cur.append(doc.createTextNode("%")); break;
                    case "#": $cur.append(doc.createTextNode(num[0])); break;
                    case "c": $cur.append(doc.createTextNode(chapter)); break;
                    case "1": if (num[1] !== chapter) num = [1, chapter]; break;
                    case "t":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cap.append($title);
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    default:
                        $cur.append("<span class=\"respec-error\"> {{ make_" + label + "_num Error (%" + s.substr(0,1) + ") }} </span>");
                        break;
                }
                $cur.append(doc.createTextNode(s.substr(1)));
                //console.log("s=\"" + s + "\"" + "  chapter=" + chapter + "  $cur.html=\"" + $cur[0].outerHTML + "\"");
            }
            if ($cur.text() !== "") {
                $cap.append($cur);
            }
            num[0]++;
            //console.log("returning $cap='" + $cap[0].outerHTML + "' num='" + num + "'");

            return num;
        };

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/figures");
                if (!conf.figFmt) conf.figFmt = conf.l10n.fig + "%(%#%) %t";

                // Move old syntax to new syntax
                $(".figure", doc).each(function (i, figure) {
                    var $figure = $(figure)
                    ,   title = $figure.attr("title") ||
                                $figure.find("[title]").attr("title") ||
                                $figure.attr("alt") ||
                                $figure.find("[alt]").attr("alt") ||
                                ""
                    ,   $caption = $("<figcaption/>").text(title);

                    // change old syntax to something HTML5 compatible
                    if ($figure.is("div")) {
                        msg.pub("warn", "You are using the deprecated div.figure syntax; please switch to <figure>.");
                        $figure.append($caption);
                        $figure.renameElement("figure");
                    }
                    else {
                        msg.pub("warn", "You are using the deprecated img.figure syntax; please switch to <figure>.");
                        $figure.wrap("<figure></figure>");
                        $figure.parent().append($caption);
                    }
                });
                
                // for each top level section, process all figures in that section
                var figMap = {}, tof = [], num = [1, 1], appendixMode = false, lastNonAppendix = -1000;
                var $secs = $("body", doc).children(conf.tocIntroductory ? "section" : "section:not(.introductory):not(#toc):not(#tof):not(#tot):not(#sect-toc):not(#sect-tof):not(#sect-tot):not(#toe):not(#sect-toe)");
				for (var i = 0; i < $secs.length; i++) {
					var $sec = $($secs[i], doc);
                    if ($sec.hasClass("appendix") && !appendixMode) {
                        lastNonAppendix = i;
                        appendixMode = true;
                    }
                    var chapter = i + 1;
                    if (appendixMode) chapter = utils.appendixMap(i - lastNonAppendix);
                    $("figure:not(.equation)", $sec).each(function () {
						var $fig = $(this)
						,   $cap = $fig.find("figcaption")
						,   id = $fig.makeID("fig", $cap.text());
						if (!$cap.length) msg.pub("warn", "A <figure> should contain a <figcaption>.");
						if ($cap.length > 1) msg.pub("warn", "A <figure> should not have more than one <figcaption>.");
                    
						// set proper caption title
						num = make_fig_num(conf.figFmt, doc, chapter ,$cap, "fig", num);
						figMap[id] = $cap.contents().clone();
                        var $tofCap = $cap.clone();
                        $tofCap.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
                        $tofCap.find("dfn").renameElement("span").removeAttr("id");
                        $tofCap.find("span.footnote").attr("class", "formerFootnote");
						tof.push($("<li class='tofline'><a class='tocxref' href='#" + id + "'></a></li>")
								.find(".tocxref")
                                .append($tofCap.contents())
                                .end());
					});
				}

                // Update all anchors with empty content that reference a figure ID
                $("a[href^='#fig']", doc).each(function () {
                    var $a = $(this)
                    ,   id = $a.attr("href");
                    if (!id) return;
                    id = id.substring(1);
                    if (figMap[id]) {
                        $a.addClass("fig-ref");
                        if ($a.html() === "") {
                            $a.append(figMap[id].clone());
                        }
                    } else {
                        $a.append("<span class='respec-error'>" + " {{ Figure #" + id + " not found.}} </span>");
                        msg.pub("warn", "Found empty <a> element referencing '" + id + "' but no matching <figure>.");
                    }
                });

                // Create a Table of Figures if a section with id 'tof' or 'sect-tof' exists.
                var $tof = $("#tof", doc);
                if ($tof.length == 0) $tof = $("#sect-tof", doc);
                if (tof.length && $tof.length) {
                    // if it has a parent section, don't touch it
                    // if it has a class of appendix or introductory, don't touch it
                    // if all the preceding section siblings are introductory, make it introductory
                    // if there is a preceding section sibling which is an appendix, make it appendix
                    if (!$tof.hasClass("appendix") && !$tof.hasClass("introductory") && !$tof.parents("section").length) {
                        if ($tof.prevAll("section.introductory").length === $tof.prevAll("section").length) {
                            $tof.addClass("introductory");
                        }
                        else if ($tof.prevAll("appendix").length) {
                            $tof.addClass("appendix");
                        }
                    }
                    $tof.append($("<h2>" + conf.l10n.tof + "</h2>"));
                    $tof.append($("<ul class='tof'><li class='tofline'><ul class='tof'/></li></ul>"));
                    var $ul = $tof.find("ul ul");
                    while (tof.length) $ul.append(tof.shift());
                }
                msg.pub("end", "core/figures");
                cb();
            }
        };
    }
);

/*globals define */

// Module core/table
// Handles tables in the document. This enables enable the generation of a Table of Tables wherever there is a #tot element
// to be found as well as normalise the titles of tables.

define(
    'core/tables',["core/utils"],
    function (utils) {
        "use strict";
        var make_fig_num = function (fmt, doc, chapter, $cap, label, num) {
            //console.log("\n\nmake_"+label+"_num(fmt='" + fmt + "' chapter='" + chapter +"' $cap='" + $cap[0].outerHTML + "' label='" + label + "' num='" + num + "'");
            if (fmt === null || fmt === "" || fmt === "%t" || fmt === "%") {
                $cap.wrapInner($("<span class='" + label + "title'/>"));
                return num;
            }
            var $title = $cap.clone().renameElement("span").attr("class", label + "title");
            //console.log("title='" + $title[0].outerHTML + "'");
            var adjfmt = " " + fmt.replace(/%%/g, "%\\");
            var sfmt = adjfmt.split("%");
            var decoration_num = 1;
            var $cur = $("<span class='" + label + "decoration " + label + "decoration0'/>");
            $cap.html("");
            //console.log("$cap='" + $cap[0].outerHTML + "'");
            //console.log("fmt=\"" + adjfmt + "\"");
            var added = 0;
            for (var i = 0; i < sfmt.length; i++) {
                var s = sfmt[i];
                switch (s.substr(0,1)) {
                    case " ": break;
                    case "(":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "no'/>");
                        break;
                    case ")":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    case "\\":$cur.append(doc.createTextNode("%")); break;
                    case "#": $cur.append(doc.createTextNode(num[0])); break;
                    case "c": $cur.append(doc.createTextNode(chapter)); break;
                    case "1": if (num[1] !== chapter) num = [1, chapter]; break;
                    case "t":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cap.append($title);
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    default:
                        $cur.append("<span class=\"respec-error\"> {{ make_" + label + "_num Error (%" + s.substr(0,1) + ") }} </span>");
                        break;
                }
                $cur.append(doc.createTextNode(s.substr(1)));
                //console.log("s=\"" + s + "\"" + "  chapter=" + chapter + "  $cur.html=\"" + $cur[0].outerHTML + "\"");
            }
            if ($cur.text() !== "") {
                $cap.append($cur);
            }
            num[0]++;
            //console.log("returning $cap='" + $cap[0].outerHTML + "' num='" + num + "'");

            return num;
        };

        return {
            run:        function (conf, doc, cb, msg) {
                msg.pub("start", "core/tables");
                if (!conf.tblFmt) conf.tblFmt = conf.l10n.tbl + "%(%#%) %t";

                // process all tables
                var tblMap = {}, tot =[ ], num = [1,1], appendixMode = false, lastNonAppendix = -1000;
                var $secs = $("body", doc).children(conf.tocIntroductory ? "section" : "section:not(.introductory):not(#toc):not(#tof):not(#tot):not(#sect-toc):not(#sect-tof):not(#sect-tot):not(#toe):not(#sect-toe)");
				for (var i = 0; i < $secs.length; i++) {
					var $sec = $($secs[i], doc);
                    if ($sec.hasClass("appendix") && !appendixMode) {
                        lastNonAppendix = i;
                        appendixMode = true;
                    }
                    var chapter = i + 1;
                    if (appendixMode) chapter = utils.appendixMap(i - lastNonAppendix);
                    $("table", $sec).each(function () {
						var $tbl = $(this)
						,   $cap = $tbl.find("caption")
						,   id = $tbl.makeID("tbl", $cap.text());
						if ($cap.length) {
							// if caption exists, add Table # and class
							num = make_fig_num(conf.tblFmt, doc, chapter ,$cap, "tbl", num);
							tblMap[id] = $cap.contents().clone();
                            var $totCap = $cap.clone();
                            $totCap.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
                            $totCap.find("dfn").renameElement("span").removeAttr("id");
                            $totCap.find("span.footnote").attr("class", "formerFootnote");
							tot.push($("<li class='totline'><a class='tocxref' href='#" + id + "'></a></li>")
									.find(".tocxref")
									.append($totCap.contents())
									.end());
						}
					});
                }

                // Update all anchors with empty content that reference a table ID
                $("a[href^='#tbl']", doc).each(function () {
                    var $a = $(this)
                    ,   id = $a.attr("href");
                    id = id.substring(1);
                    if (tblMap[id]) {
                        $a.addClass("tbl-ref");
                        if ($a.html() === "") {
                            $a.append(tblMap[id].clone());
                        }
                    } else {
                        $a.append("<span class=\"respec-error\">" + " {{ Table #" + id + " not found.}} </span>");
                        msg.pub("warn", "Found empty <a> element referencing '" + id + "' but no matching <table>.");
                    }
                });
                
                // Create a Table of Tables if a section with id 'tot' or 'sect-tot' exists.
                var $tot = $("#tot", doc);
                if ($tot.length == 0) $tot = $("#sect-tot", doc);
                if (tot.length && $tot.length) {
                    // if it has a parent section, don't touch it
                    // if it has a class of appendix or introductory, don't touch it
                    // if all the preceding section siblings are introductory, make it introductory
                    // if there is a preceding section sibling which is an appendix, make it appendix
                    if (! $tot.hasClass("appendix") && ! $tot.hasClass("introductory") && ! $tot.parents("section").length) {
                        if ($tot.prevAll("section.introductory").length === $tot.prevAll("section").length) {
                            $tot.addClass("introductory");
                        } else if ($tot.prevAll("appendix").length) {
                            $tot.addClass("appendix");
                        }
                    }
                    $tot.append($("<h2>" + conf.l10n.tot + "</h2>"));
                    $tot.append($("<ul class='tot'><li class='totline'><ul class='tot'/></li></ul>"));
                    var $ul = $tot.find("ul ul");
                    while (tot.length) $ul.append(tot.shift());
                }
                msg.pub("end", "core/tables");
                cb();
            }
        };
    }
);

/*globals define*/

// Module core/equation
// Handles equations in the document. This encompasses enablling the generation of a
// Table of Equations wherever there is a #toe or #sect-toe element to be found.
// This also normalizes equation titles.

define(
    'core/equations',["core/utils"],
    function (utils) {
        "use strict";
        var make_eqn_num = function (fmt, doc, chapter, $cap, label, num) {
            //console.log("\n\nmake_"+label+"_num(fmt='" + fmt + "' chapter='" + chapter +"' $cap='" + $cap[0].outerHTML + "' label='" + label + "' num='" + num + "'");
            if (fmt === null || fmt === "" || fmt === "%t" || fmt === "%") {
                $cap.wrapInner($("<span class='" + label + "title'/>"));
                return num;
            }
            var $title = $cap.clone().renameElement("span").attr("class", label + "title");
            //console.log("title='" + $title[0].outerHTML + "'");
            var adjfmt = " " + fmt.replace(/%%/g, "%\\");
            var sfmt = adjfmt.split("%");
            var decoration_num = 1;
            var $cur = $("<span class='" + label + "decoration " + label + "decoration0'/>");
            $cap.html("");
            //console.log("$cap='" + $cap[0].outerHTML + "'");
            //console.log("fmt=\"" + adjfmt + "\"");
            var added = 0;
            for (var i = 0; i < sfmt.length; i++) {
                var s = sfmt[i];
                switch (s.substr(0,1)) {
                    case " ": break;
                    case "(":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "no'/>");
                        break;
                    case ")":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    case "\\":$cur.append(doc.createTextNode("%")); break;
                    case "#": $cur.append(doc.createTextNode(num[0])); break;
                    case "c": $cur.append(doc.createTextNode(chapter)); break;
                    case "1": if (num[1] !== chapter) num = [1, chapter]; break;
                    case "t":
                        if ($cur.text() !== "") {
                            $cap.append($cur);
                        }
                        $cap.append($title);
                        $cur = $("<span class='" + label + "decoration " + label + "decoration" + decoration_num + "'/>");
                        decoration_num = decoration_num + 1;
                        break;
                    default:
                        $cur.append("<span class=\"respec-error\"> {{ make_" + label + "_num Error (%" + s.substr(0,1) + ") }} </span>");
                        break;
                }
                $cur.append(doc.createTextNode(s.substr(1)));
                //console.log("s=\"" + s + "\"" + "  chapter=" + chapter + "  $cur.html=\"" + $cur[0].outerHTML + "\"");
            }
            if ($cur.text() !== "") {
                $cap.append($cur);
            }
            num[0]++;
            //console.log("returning $cap='" + $cap[0].outerHTML + "' num='" + num + "'");

            return num;
        };

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/equations");
                if (!conf.eqnFmt) conf.eqnFmt = conf.l10n.eqn + "%(%#%) %t";
                
                // for each top level section, process all equations in that section
                var eqnMap = {}, toe = [], num = [1, 1], appendixMode = false, lastNonAppendix = -1000;
                var $secs = $("body", doc).children(conf.tocIntroductory ? "section" : "section:not(.introductory):not(#toc):not(#toe):not(#tot):not(#sect-toc):not(#sect-toe):not(#sect-tot):not(#toe):not(#sect-toe)");
				for (var i = 0; i < $secs.length; i++) {
					var $sec = $($secs[i], doc);
                    if ($sec.hasClass("appendix") && !appendixMode) {
                        lastNonAppendix = i;
                        appendixMode = true;
                    }
                    var chapter = i + 1;
                    if (appendixMode) chapter = utils.appendixMap(i - lastNonAppendix);
                    $("figure.equation", $sec).each(function () {
						var $eqn = $(this)
						,   $cap = $eqn.find("figcaption")
						,   id = $eqn.makeID("eqn", $cap.text());
						if (!$cap.length) msg.pub("warn", "An <equation> should contain a <figcaption>.");
                        if ($cap.length === 0) {
                            $eqn.append("<figcaption></figcaption>");
                            $cap = $eqn.find("figcaption");
                        }
						if ($cap.length > 1) msg.pub("warn", "An <equation> should not have more than one <figcaption>.");
                    
						// set proper caption title
						num = make_eqn_num(conf.eqnFmt, doc, chapter ,$cap, "eqn", num);
						eqnMap[id] = $cap.contents().clone();
                        var $toeCap = $cap.clone();
                        $toeCap.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
                        $toeCap.find("dfn").renameElement("span").removeAttr("id");
                        $toeCap.find("span.footnote").attr("class", "formerFootnote");
						toe.push($("<li class='toeline'><a class='tocxref' href='#" + id + "'></a></li>")
								.find(".tocxref")
                                .append($toeCap.contents())
                                .end());
					});
				}

                // Update all anchors with empty content that reference a equation ID
                $("a[href^='#eqn']", doc).each(function () {
                    var $a = $(this)
                    ,   id = $a.attr("href");
                    if (!id) return;
                    id = id.substring(1);
                    if (eqnMap[id]) {
                        $a.addClass("eqn-ref");
                        if ($a.html() === "") {
                            $a.append(eqnMap[id].clone());
                        }
                    } else {
                        $a.append("<span class='respec-error'>" + " {{ equation #" + id + " not found.}} </span>");
                        msg.pub("warn", "Found empty <a> element referencing '" + id + "' but no matching <equation>.");
                    }
                });

                // Create a Table of equations if a section with id 'toe' or 'sect-toe' exists.
                var $toe = $("#toe", doc);
                if ($toe.length == 0) $toe = $("#sect-toe", doc);
                if (toe.length && $toe.length) {
                    // if it has a parent section, don't touch it
                    // if it has a class of appendix or introductory, don't touch it
                    // if all the preceding section siblings are introductory, make it introductory
                    // if there is a preceding section sibling which is an appendix, make it appendix
                    if (!$toe.hasClass("appendix") && !$toe.hasClass("introductory") && !$toe.parents("section").length) {
                        if ($toe.prevAll("section.introductory").length === $toe.prevAll("section").length) {
                            $toe.addClass("introductory");
                        }
                        else if ($toe.prevAll("appendix").length) {
                            $toe.addClass("appendix");
                        }
                    }
                    $toe.append($("<h2>" + conf.l10n.toe + "</h2>"));
                    $toe.append($("<ul class='toe'><li class='toeline'><ul class='toe'/></li></ul>"));
                    var $ul = $toe.find("ul ul");
                    while (toe.length) $ul.append(toe.shift());
                }
                msg.pub("end", "core/equations");
                cb();
            }
        };
    }
);


// Module core/biblio
// Handles bibliographic references
// Configuration:
//  - localBiblio: override or supplement the official biblio with your own.

define(
    'core/biblio',[],
    function () {
        var getRefKeys = function (conf) {
            var informs = conf.informativeReferences
            ,   norms = conf.normativeReferences
            ,   del = []
            ,   getKeys = function (obj) {
                    var res = [];
                    for (var k in obj) res.push(k);
                    return res;
                }
            ;
            for (var k in informs) if (norms[k]) del.push(k);
            for (var i = 0; i < del.length; i++) delete informs[del[i]];
            return {
                informativeReferences: getKeys(informs),
                normativeReferences: getKeys(norms)
            };
        };
        var REF_STATUSES = {
            "NOTE":     "W3C Note"
        ,   "WG-NOTE":  "W3C Working Group Note"
        ,   "ED":       "W3C Editor's Draft"
        ,   "FPWD":     "W3C First Public Working Draft"
        ,   "WD":       "W3C Working Draft"
        ,   "LCWD":     "W3C Last Call Working Draft"
        ,   "CR":       "W3C Candidate Recommendation"
        ,   "PR":       "W3C Proposed Recommendation"
        ,   "PER":      "W3C Proposed Edited Recommendation"
        ,   "REC":      "W3C Recommendation"
        };
        var stringifyRef = function(ref) {
            if (typeof ref === "string") return ref;
            var output = "";
            if (ref.authors && ref.authors.length) {
                output += ref.authors.join("; ");
                if (ref.etAl) output += " et al";
                output += ". ";
            }
            if (ref.href) output += '<a href="' + ref.href + '"><cite>' + ref.title + "</cite></a>. ";
            else output += '<cite>' + ref.title + '</cite>. ';
            if (ref.date) output += ref.date + ". ";
            if (ref.status) output += (REF_STATUSES[ref.status] || ref.status) + ". ";
            if (ref.href) output += 'URL: <a href="' + ref.href + '">' + ref.href + "</a>";
            return output;
        };
        var bibref = function (conf, msg) {
            // this is in fact the bibref processing portion
            var badrefs = {}
            ,   refs = getRefKeys(conf)
            ,   informs = refs.informativeReferences
            ,   norms = refs.normativeReferences
            ,   aliases = {}
            ;

            if (!informs.length && !norms.length && !conf.refNote) return;
            var $refsec = $("<section id='references' class='appendix'><h2>References</h2></section>").appendTo($("body"));
            if (conf.refNote) $("<p></p>").html(conf.refNote).appendTo($refsec);

            var types = ["Normative", "Informative"];
            for (var i = 0; i < types.length; i++) {
                var type = types[i]
                ,   refs = (type == "Normative") ? norms : informs;
                if (!refs.length) continue;
                var $sec = $("<section><h3></h3></section>")
                                .appendTo($refsec)
                                .find("h3")
                                    .text(type + " references")
                                .end()
                                ;
                $sec.makeID(null, type + " references");
                refs.sort();
                var $dl = $("<dl class='bibliography'></dl>").appendTo($sec);
                if (conf.doRDFa) $dl.attr("resource", "");
                for (var j = 0; j < refs.length; j++) {
                    var ref = refs[j];
                    $("<dt></dt>")
                        .attr({ id:"bib-" + ref })
                        .text("[" + ref + "]")
                        .appendTo($dl)
                        ;
                    var $dd = $("<dd></dd>").appendTo($dl);
                    var refcontent = conf.biblio[ref]
                    ,   circular = {}
                    ,   key = ref;
                    circular[ref] = true;
                    while (refcontent && refcontent.aliasOf) {
                        if (circular[refcontent.aliasOf]) {
                            refcontent = null;
                            msg.pub("error", "Circular reference in biblio DB between [" + ref + "] and [" + key + "].");
                        }
                        else {
                            key = refcontent.aliasOf;
                            refcontent = conf.biblio[key];
                            circular[key] = true;
                        }
                    }
                    aliases[key] = aliases[key] || [];
                    if (aliases[key].indexOf(ref) < 0) aliases[key].push(ref);
                    if (refcontent) {
                        $dd.html(stringifyRef(refcontent) + "\n");
                        if (conf.doRDFa) {
                            var $a = $dd.children("a");
                            $a.attr("property", type === "Normative" ? "dc:requires" : "dc:references");
                        }
                    }
                    else {
                        if (!badrefs[ref]) badrefs[ref] = 0;
                        badrefs[ref]++;
                        $dd.html("<em style='color: #f00'>Reference not found.</em>\n");
                    }
                }
            }
            for (var k in aliases) {
                if (aliases[k].length > 1) {
                    msg.pub("warn", "[" + k + "] is referenced in " + aliases[k].length + " ways (" + aliases[k].join(", ") + "). This causes duplicate entries in the reference section.");
                }
            }
            for (var item in badrefs) {
                if (badrefs.hasOwnProperty(item)) msg.pub("error", "Bad reference: [" + item + "] (appears " + badrefs[item] + " times)");
            }
        };

        return {
            stringifyRef: stringifyRef,
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/biblio");
                var refs = getRefKeys(conf)
                ,   localAliases = []
                ,   finish = function () {
                        msg.pub("end", "core/biblio");
                        cb();
                    }
                ;
                if (conf.localBiblio) {
                    for (var k in conf.localBiblio) {
                        if (typeof conf.localBiblio[k].aliasOf !== "undefined") {
                            localAliases.push(conf.localBiblio[k].aliasOf);
                        }
                    }
                }
                refs = refs.normativeReferences
                                .concat(refs.informativeReferences)
                                .concat(localAliases);
                if (refs.length) {
                    if (conf.onlyLocalBiblio) {
                        conf.biblio = {};
                        // override biblio data
                        if (conf.localBiblio) {
                            for (var k in conf.localBiblio) conf.biblio[k] = conf.localBiblio[k];
                        }
                        bibref(conf, msg);
                        finish();
                    } else {
                    var url = "https://labs.w3.org/specrefs/bibrefs?refs=" + refs.join(",");
                    $.ajax({
                        dataType:   "json"
                    ,   url:        url
                    ,   success:    function (data) {
                            conf.biblio = data || {};
                            // override biblio data
                            if (conf.localBiblio) {
                                for (var k in conf.localBiblio) conf.biblio[k] = conf.localBiblio[k];
                            }
                            bibref(conf, msg);
                            finish();
                        }
                    ,   error:      function (xhr, status, error) {
                            msg.pub("error", "Error loading references from '" + url + "': " + status + " (" + error + ")");
                            finish();
                        }
                    });
                }
                }
                else finish();
            }
        };
    }
);



(function () {
    var tokenise = function (str) {
        var tokens = []
        ,   re = {
                "float":        /^-?(([0-9]+\.[0-9]*|[0-9]*\.[0-9]+)([Ee][-+]?[0-9]+)?|[0-9]+[Ee][-+]?[0-9]+)/
            ,   "integer":      /^-?(0([Xx][0-9A-Fa-f]+|[0-7]*)|[1-9][0-9]*)/
            ,   "identifier":   /^[A-Z_a-z][0-9A-Z_a-z]*/
            ,   "string":       /^"[^"]*"/
            ,   "whitespace":   /^(?:[\t\n\r ]+|[\t\n\r ]*((\/\/.*|\/\*(.|\n|\r)*?\*\/)[\t\n\r ]*))+/
            ,   "other":        /^[^\t\n\r 0-9A-Z_a-z]/
            }
        ,   types = []
        ;
        for (var k in re) types.push(k);
        while (str.length > 0) {
            var matched = false;
            for (var i = 0, n = types.length; i < n; i++) {
                var type = types[i];
                str = str.replace(re[type], function (tok) {
                    tokens.push({ type: type, value: tok });
                    matched = true;
                    return "";
                });
                if (matched) break;
            }
            if (matched) continue;
            throw new Error("Token stream not progressing");
        }
        return tokens;
    };
    
    var parse = function (tokens, opt) {
        var line = 1;
        tokens = tokens.slice();
        
        var FLOAT = "float"
        ,   INT = "integer"
        ,   ID = "identifier"
        ,   STR = "string"
        ,   OTHER = "other"
        ;
        
        var WebIDLParseError = function (str, line, input, tokens) {
            this.message = str;
            this.line = line;
            this.input = input;
            this.tokens = tokens;
        };
        WebIDLParseError.prototype.toString = function () {
            return this.message + ", line " + this.line + " (tokens: '" + this.input + "')\n" +
                   JSON.stringify(this.tokens, null, 4);
        };
        
        var error = function (str) {
            var tok = "", numTokens = 0, maxTokens = 5;
            while (numTokens < maxTokens && tokens.length > numTokens) {
                tok += tokens[numTokens].value;
                numTokens++;
            }
            throw new WebIDLParseError(str, line, tok, tokens.slice(0, 5));
        };
        
        var last_token = null;
        
        var consume = function (type, value) {
            if (!tokens.length || tokens[0].type !== type) return;
            if (typeof value === "undefined" || tokens[0].value === value) {
                 last_token = tokens.shift();
                 if (type === ID) last_token.value = last_token.value.replace(/^_/, "");
                 return last_token;
             }
        };
        
        var ws = function () {
            if (!tokens.length) return;
            if (tokens[0].type === "whitespace") {
                var t = tokens.shift();
                t.value.replace(/\n/g, function (m) { line++; return m; });
                return t;
            }
        };
        
        var all_ws = function (store, pea) { // pea == post extended attribute, tpea = same for types
            var t = { type: "whitespace", value: "" };
            while (true) {
                var w = ws();
                if (!w) break;
                t.value += w.value;
            }
            if (t.value.length > 0) {
                if (store) {
                    var w = t.value
                    ,   re = {
                            "ws":                   /^([\t\n\r ]+)/
                        ,   "line-comment":         /^\/\/(.*)\n?/m
                        ,   "multiline-comment":    /^\/\*((?:.|\n|\r)*?)\*\//
                        }
                    ,   wsTypes = []
                    ;
                    for (var k in re) wsTypes.push(k);
                    while (w.length) {
                        var matched = false;
                        for (var i = 0, n = wsTypes.length; i < n; i++) {
                            var type = wsTypes[i];
                            w = w.replace(re[type], function (tok, m1) {
                                store.push({ type: type + (pea ? ("-" + pea) : ""), value: m1 });
                                matched = true;
                                return "";
                            });
                            if (matched) break;
                        }
                        if (matched) continue;
                        throw new Error("Surprising white space construct."); // this shouldn't happen
                    }
                }
                return t;
            }
        };
        
        var integer_type = function () {
            var ret = "";
            all_ws();
            if (consume(ID, "unsigned")) ret = "unsigned ";
            all_ws();
            if (consume(ID, "short")) return ret + "short";
            if (consume(ID, "long")) {
                ret += "long";
                all_ws();
                if (consume(ID, "long")) return ret + " long";
                return ret;
            }
            if (ret) error("Failed to parse integer type");
        };
        
        var float_type = function () {
            var ret = "";
            all_ws();
            if (consume(ID, "unrestricted")) ret = "unrestricted ";
            all_ws();
            if (consume(ID, "float")) return ret + "float";
            if (consume(ID, "double")) return ret + "double";
            if (ret) error("Failed to parse float type");
        };
        
        var primitive_type = function () {
            var num_type = integer_type() || float_type();
            if (num_type) return num_type;
            all_ws();
            if (consume(ID, "boolean")) return "boolean";
            if (consume(ID, "byte")) return "byte";
            if (consume(ID, "octet")) return "octet";
        };
        
        var const_value = function () {
            if (consume(ID, "true")) return { type: "boolean", value: true };
            if (consume(ID, "false")) return { type: "boolean", value: false };
            if (consume(ID, "null")) return { type: "null" };
            if (consume(ID, "Infinity")) return { type: "Infinity", negative: false };
            if (consume(ID, "NaN")) return { type: "NaN" };
            var ret = consume(FLOAT) || consume(INT);
            if (ret) return { type: "number", value: 1 * ret.value };
            var tok = consume(OTHER, "-");
            if (tok) {
                if (consume(ID, "Infinity")) return { type: "Infinity", negative: true };
                else tokens.unshift(tok);
            }
        };
        
        var type_suffix = function (obj) {
            while (true) {
                all_ws();
                if (consume(OTHER, "?")) {
                    if (obj.nullable) error("Can't nullable more than once");
                    obj.nullable = true;
                }
                else if (consume(OTHER, "[")) {
                    all_ws();
                    consume(OTHER, "]") || error("Unterminated array type");
                    if (!obj.array) {
                        obj.array = 1;
                        obj.nullableArray = [obj.nullable];
                    }
                    else {
                        obj.array++;
                        obj.nullableArray.push(obj.nullable);
                    }
                    obj.nullable = false;
                }
                else return;
            }
        };
        
        var single_type = function () {
            var prim = primitive_type()
            ,   ret = { sequence: false, generic: null, nullable: false, array: false, union: false }
            ,   name
            ,   value
            ;
            if (prim) {
                ret.idlType = prim;
            }
            else if (name = consume(ID)) {
                value = name.value;
                all_ws();
                // Generic types
                if (consume(OTHER, "<")) {
                    // backwards compat
                    if (value === "sequence") {
                        ret.sequence = true;
                    }
                    ret.generic = value;
                    ret.idlType = type() || error("Error parsing generic type " + value);
                    all_ws();
                    if (!consume(OTHER, ">")) error("Unterminated generic type " + value);
                    type_suffix(ret);
                    return ret;
                }
                else {
                    ret.idlType = value;
                }
            }
            else {
                return;
            }
            type_suffix(ret);
            if (ret.nullable && !ret.array && ret.idlType === "any") error("Type any cannot be made nullable");
            return ret;
        };
        
        var union_type = function () {
            all_ws();
            if (!consume(OTHER, "(")) return;
            var ret = { sequence: false, generic: null, nullable: false, array: false, union: true, idlType: [] };
            var fst = type() || error("Union type with no content");
            ret.idlType.push(fst);
            while (true) {
                all_ws();
                if (!consume(ID, "or")) break;
                var typ = type() || error("No type after 'or' in union type");
                ret.idlType.push(typ);
            }
            if (!consume(OTHER, ")")) error("Unterminated union type");
            type_suffix(ret);
            return ret;
        };
        
        var type = function () {
            return single_type() || union_type();
        };
        
        var argument = function (store) {
            var ret = { optional: false, variadic: false };
            ret.extAttrs = extended_attrs(store);
            all_ws(store, "pea");
            var opt_token = consume(ID, "optional");
            if (opt_token) {
                ret.optional = true;
                all_ws();
            }
            ret.idlType = type();
            if (!ret.idlType) {
                if (opt_token) tokens.unshift(opt_token);
                return;
            }
            var type_token = last_token;
            if (!ret.optional) {
                all_ws();
                if (tokens.length >= 3 &&
                    tokens[0].type === "other" && tokens[0].value === "." &&
                    tokens[1].type === "other" && tokens[1].value === "." &&
                    tokens[2].type === "other" && tokens[2].value === "."
                    ) {
                    tokens.shift();
                    tokens.shift();
                    tokens.shift();
                    ret.variadic = true;
                }
            }
            all_ws();
            var name = consume(ID);
            if (!name) {
                if (opt_token) tokens.unshift(opt_token);
                tokens.unshift(type_token);
                return;
            }
            ret.name = name.value;
            if (ret.optional) {
                all_ws();
                ret["default"] = default_();
            }
            return ret;
        };
        
        var argument_list = function (store) {
            var ret = []
            ,   arg = argument(store ? ret : null)
            ;
            if (!arg) return;
            ret.push(arg);
            while (true) {
                all_ws(store ? ret : null);
                if (!consume(OTHER, ",")) return ret;
                var nxt = argument(store ? ret : null) || error("Trailing comma in arguments list");
                ret.push(nxt);
            }
        };
        
        var type_pair = function () {
            all_ws();
            var k = type();
            if (!k) return;
            all_ws()
            if (!consume(OTHER, ",")) return;
            all_ws();
            var v = type();
            if (!v) return;
            return [k, v];
        };
        
        var simple_extended_attr = function (store) {
            all_ws();
            var name = consume(ID);
            if (!name) return;
            var ret = {
                name: name.value
            ,   "arguments": null
            };
            all_ws();
            var eq = consume(OTHER, "=");
            if (eq) {
                var rhs;
                all_ws();
                if (rhs = consume(ID)) {
                  ret.rhs = rhs
                }
                else if (consume(OTHER, "(")) {
                    // [Exposed=(Window,Worker)]
                    rhs = [];
                    var id = consume(ID);
                    if (id) {
                      rhs = [id.value];
                    }
                    identifiers(rhs);
                    consume(OTHER, ")") || error("Unexpected token in extended attribute argument list or type pair");
                    ret.rhs = {
                        type: "identifier-list",
                        value: rhs
                    };
                }
                if (!ret.rhs) return error("No right hand side to extended attribute assignment");
            }
            all_ws();
            if (consume(OTHER, "(")) {
                var args, pair;
                // [Constructor(DOMString str)]
                if (args = argument_list(store)) {
                    ret["arguments"] = args;
                }
                // [MapClass(DOMString, DOMString)]
                else if (pair = type_pair()) {
                    ret.typePair = pair;
                }
                // [Constructor()]
                else {
                    ret["arguments"] = [];
                }
                all_ws();
                consume(OTHER, ")") || error("Unexpected token in extended attribute argument list or type pair");
            }
            return ret;
        };
        
        // Note: we parse something simpler than the official syntax. It's all that ever
        // seems to be used
        var extended_attrs = function (store) {
            var eas = [];
            all_ws(store);
            if (!consume(OTHER, "[")) return eas;
            eas[0] = simple_extended_attr(store) || error("Extended attribute with not content");
            all_ws();
            while (consume(OTHER, ",")) {
                eas.push(simple_extended_attr(store) || error("Trailing comma in extended attribute"));
                all_ws();
            }
            consume(OTHER, "]") || error("No end of extended attribute");
            return eas;
        };
        
        var default_ = function () {
            all_ws();
            if (consume(OTHER, "=")) {
                all_ws();
                var def = const_value();
                if (def) {
                    return def;
                }
                else if (consume(OTHER, "[")) {
                    if (!consume(OTHER, "]")) error("Default sequence value must be empty");
                    return { type: "sequence", value: [] };
                }
                else {
                    var str = consume(STR) || error("No value for default");
                    str.value = str.value.replace(/^"/, "").replace(/"$/, "");
                    return str;
                }
            }
        };
        
        var const_ = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "const")) return;
            var ret = { type: "const", nullable: false };
            all_ws();
            var typ = primitive_type();
            if (!typ) {
                typ = consume(ID) || error("No type for const");
                typ = typ.value;
            }
            ret.idlType = typ;
            all_ws();
            if (consume(OTHER, "?")) {
                ret.nullable = true;
                all_ws();
            }
            var name = consume(ID) || error("No name for const");
            ret.name = name.value;
            all_ws();
            consume(OTHER, "=") || error("No value assignment for const");
            all_ws();
            var cnt = const_value();
            if (cnt) ret.value = cnt;
            else error("No value for const");
            all_ws();
            consume(OTHER, ";") || error("Unterminated const");
            return ret;
        };
        
        var inheritance = function () {
            all_ws();
            if (consume(OTHER, ":")) {
                all_ws();
                var inh = consume(ID) || error ("No type in inheritance");
                return inh.value;
            }
        };
        
        var operation_rest = function (ret, store) {
            all_ws();
            if (!ret) ret = {};
            var name = consume(ID);
            ret.name = name ? name.value : null;
            all_ws();
            consume(OTHER, "(") || error("Invalid operation");
            ret["arguments"] = argument_list(store) || [];
            all_ws();
            consume(OTHER, ")") || error("Unterminated operation");
            all_ws();
            consume(OTHER, ";") || error("Unterminated operation");
            return ret;
        };
        
        var callback = function (store) {
            all_ws(store, "pea");
            var ret;
            if (!consume(ID, "callback")) return;
            all_ws();
            var tok = consume(ID, "interface");
            if (tok) {
                tokens.unshift(tok);
                ret = interface_();
                ret.type = "callback interface";
                return ret;
            }
            var name = consume(ID) || error("No name for callback");
            ret = { type: "callback", name: name.value };
            all_ws();
            consume(OTHER, "=") || error("No assignment in callback");
            all_ws();
            ret.idlType = return_type();
            all_ws();
            consume(OTHER, "(") || error("No arguments in callback");
            ret["arguments"] = argument_list(store) || [];
            all_ws();
            consume(OTHER, ")") || error("Unterminated callback");
            all_ws();
            consume(OTHER, ";") || error("Unterminated callback");
            return ret;
        };

        var attribute = function (store) {
            all_ws(store, "pea");
            var grabbed = []
            ,   ret = {
                type:           "attribute"
            ,   "static":       false
            ,   stringifier:    false
            ,   inherit:        false
            ,   readonly:       false
            };
            if (consume(ID, "static")) {
                ret["static"] = true;
                grabbed.push(last_token);
            }
            else if (consume(ID, "stringifier")) {
                ret.stringifier = true;
                grabbed.push(last_token);
            }
            var w = all_ws();
            if (w) grabbed.push(w);
            if (consume(ID, "inherit")) {
                if (ret["static"] || ret.stringifier) error("Cannot have a static or stringifier inherit");
                ret.inherit = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            if (consume(ID, "readonly")) {
                ret.readonly = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            if (!consume(ID, "attribute")) {
                tokens = grabbed.concat(tokens);
                return;
            }
            all_ws();
            ret.idlType = type() || error("No type in attribute");
            if (ret.idlType.sequence) error("Attributes cannot accept sequence types");
            all_ws();
            var name = consume(ID) || error("No name in attribute");
            ret.name = name.value;
            all_ws();
            consume(OTHER, ";") || error("Unterminated attribute");
            return ret;
        };
        
        var return_type = function () {
            var typ = type();
            if (!typ) {
                if (consume(ID, "void")) {
                    return "void";
                }
                else error("No return type");
            }
            return typ;
        };
        
        var operation = function (store) {
            all_ws(store, "pea");
            var ret = {
                type:           "operation"
            ,   getter:         false
            ,   setter:         false
            ,   creator:        false
            ,   deleter:        false
            ,   legacycaller:   false
            ,   "static":       false
            ,   stringifier:    false
            };
            while (true) {
                all_ws();
                if (consume(ID, "getter")) ret.getter = true;
                else if (consume(ID, "setter")) ret.setter = true;
                else if (consume(ID, "creator")) ret.creator = true;
                else if (consume(ID, "deleter")) ret.deleter = true;
                else if (consume(ID, "legacycaller")) ret.legacycaller = true;
                else break;
            }
            if (ret.getter || ret.setter || ret.creator || ret.deleter || ret.legacycaller) {
                all_ws();
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            if (consume(ID, "static")) {
                ret["static"] = true;
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            else if (consume(ID, "stringifier")) {
                ret.stringifier = true;
                all_ws();
                if (consume(OTHER, ";")) return ret;
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            ret.idlType = return_type();
            all_ws();
            if (consume(ID, "iterator")) {
                all_ws();
                ret.type = "iterator";
                if (consume(ID, "object")) {
                    ret.iteratorObject = "object";
                }
                else if (consume(OTHER, "=")) {
                    all_ws();
                    var name = consume(ID) || error("No right hand side in iterator");
                    ret.iteratorObject = name.value;
                }
                all_ws();
                consume(OTHER, ";") || error("Unterminated iterator");
                return ret;
            }
            else {
                operation_rest(ret, store);
                return ret;
            }
        };
        
        var identifiers = function (arr) {
            while (true) {
                all_ws();
                if (consume(OTHER, ",")) {
                    all_ws();
                    var name = consume(ID) || error("Trailing comma in identifiers list");
                    arr.push(name.value);
                }
                else break;
            }
        };
        
        var serialiser = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "serializer")) return;
            var ret = { type: "serializer" };
            all_ws();
            if (consume(OTHER, "=")) {
                all_ws();
                if (consume(OTHER, "{")) {
                    ret.patternMap = true;
                    all_ws();
                    var id = consume(ID);
                    if (id && id.value === "getter") {
                        ret.names = ["getter"];
                    }
                    else if (id && id.value === "inherit") {
                        ret.names = ["inherit"];
                        identifiers(ret.names);
                    }
                    else if (id) {
                        ret.names = [id.value];
                        identifiers(ret.names);
                    }
                    else {
                        ret.names = [];
                    }
                    all_ws();
                    consume(OTHER, "}") || error("Unterminated serializer pattern map");
                }
                else if (consume(OTHER, "[")) {
                    ret.patternList = true;
                    all_ws();
                    var id = consume(ID);
                    if (id && id.value === "getter") {
                        ret.names = ["getter"];
                    }
                    else if (id) {
                        ret.names = [id.value];
                        identifiers(ret.names);
                    }
                    else {
                        ret.names = [];
                    }
                    all_ws();
                    consume(OTHER, "]") || error("Unterminated serializer pattern list");
                }
                else {
                    var name = consume(ID) || error("Invalid serializer");
                    ret.name = name.value;
                }
                all_ws();
                consume(OTHER, ";") || error("Unterminated serializer");
                return ret;
            }
            else if (consume(OTHER, ";")) {
                // noop, just parsing
            }
            else {
                ret.idlType = return_type();
                all_ws();
                ret.operation = operation_rest(null, store);
            }
            return ret;
        };

        var iterable_type = function() {
            if (consume(ID, "iterable")) return "iterable";
            else if (consume(ID, "legacyiterable")) return "legacyiterable";
            else if (consume(ID, "maplike")) return "maplike";
            else if (consume(ID, "setlike")) return "setlike";
            else return;
        }

        var readonly_iterable_type = function() {
            if (consume(ID, "maplike")) return "maplike";
            else if (consume(ID, "setlike")) return "setlike";
            else return;
        }

        var iterable = function (store) {
            all_ws(store, "pea");
            var grabbed = [],
                ret = {type: null, idlType: null, readonly: false};
            if (consume(ID, "readonly")) {
                ret.readonly = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            var consumeItType = ret.readonly ? readonly_iterable_type : iterable_type;

            var ittype = consumeItType();
            if (!ittype) {
                tokens = grabbed.concat(tokens);
                return;
            }

            var secondTypeRequired = ittype === "maplike";
            var secondTypeAllowed = secondTypeRequired || ittype === "iterable";
            ret.type = ittype;
            if (ret.type !== 'maplike' && ret.type !== 'setlike')
                delete ret.readonly;
            all_ws();
            if (consume(OTHER, "<")) {
                ret.idlType = type() || error("Error parsing " + ittype + " declaration");
                all_ws();
                if (secondTypeAllowed) {
                    var type2 = null;
                    if (consume(OTHER, ",")) {
                        all_ws();
                        type2 = type();
                        all_ws();                        
                    }
                    if (type2)
                        ret.idlType = [ret.idlType, type2];
                    else if (secondTypeRequired)
                        error("Missing second type argument in " + ittype + " declaration");
                }
                if (!consume(OTHER, ">")) error("Unterminated " + ittype + " declaration");
                all_ws();
                if (!consume(OTHER, ";")) error("Missing semicolon after " + ittype + " declaration");
            }
            else
                error("Error parsing " + ittype + " declaration");

            return ret;            
        }        
        
        var interface_ = function (isPartial, store) {
            all_ws(isPartial ? null : store, "pea");
            if (!consume(ID, "interface")) return;
            all_ws();
            var name = consume(ID) || error("No name for interface");
            var mems = []
            ,   ret = {
                type:   "interface"
            ,   name:   name.value
            ,   partial:    false
            ,   members:    mems
            };
            if (!isPartial) ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless interface");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after interface");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws();
                var cnt = const_(store ? mems : null);
                if (cnt) {
                    cnt.extAttrs = ea;
                    ret.members.push(cnt);
                    continue;
                }
                var mem = (opt.allowNestedTypedefs && typedef(store ? mems : null)) ||
                          iterable(store ? mems : null) ||
                          serialiser(store ? mems : null) ||
                          attribute(store ? mems : null) ||
                          operation(store ? mems : null) ||
                          error("Unknown member");
                mem.extAttrs = ea;
                ret.members.push(mem);
            }
        };
        
        var partial = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "partial")) return;
            var thing = dictionary(true, store) ||
                        interface_(true, store) ||
                        error("Partial doesn't apply to anything");
            thing.partial = true;
            return thing;
        };
        
        var dictionary = function (isPartial, store) {
            all_ws(isPartial ? null : store, "pea");
            if (!consume(ID, "dictionary")) return;
            all_ws();
            var name = consume(ID) || error("No name for dictionary");
            var mems = []
            ,   ret = {
                type:   "dictionary"
            ,   name:   name.value
            ,   partial:    false
            ,   members:    mems
            };
            if (!isPartial) ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless dictionary");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after dictionary");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws(store ? mems : null, "pea");
                var required = consume(ID, "required");
                var typ = type() || error("No type for dictionary member");
                all_ws();
                var name = consume(ID) || error("No name for dictionary member");
                var dflt = default_();
                if (required && dflt) error("Required member must not have a default");
                ret.members.push({
                    type:       "field"
                ,   name:       name.value
                ,   required:   !!required
                ,   idlType:    typ
                ,   extAttrs:   ea
                ,   "default":  dflt
                });
                all_ws();
                consume(OTHER, ";") || error("Unterminated dictionary member");
            }
        };
        
        var exception = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "exception")) return;
            all_ws();
            var name = consume(ID) || error("No name for exception");
            var mems = []
            ,   ret = {
                type:   "exception"
            ,   name:   name.value
            ,   members:    mems
            };
            ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless exception");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after exception");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws(store ? mems : null, "pea");
                var cnt = const_();
                if (cnt) {
                    cnt.extAttrs = ea;
                    ret.members.push(cnt);
                }
                else {
                    var typ = type();
                    all_ws();
                    var name = consume(ID);
                    all_ws();
                    if (!typ || !name || !consume(OTHER, ";")) error("Unknown member in exception body");
                    ret.members.push({
                        type:       "field"
                    ,   name:       name.value
                    ,   idlType:    typ
                    ,   extAttrs:   ea
                    });
                }
            }
        };
        
        var enum_ = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "enum")) return;
            all_ws();
            var name = consume(ID) || error("No name for enum");
            var vals = []
            ,   ret = {
                type:   "enum"
            ,   name:   name.value
            ,   values: vals
            };
            all_ws();
            consume(OTHER, "{") || error("No curly for enum");
            var saw_comma = false;
            while (true) {
                all_ws(store ? vals : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("No semicolon after enum");
                    return ret;
                }
                var val = consume(STR) || error("Unexpected value in enum");
                ret.values.push(val.value.replace(/"/g, ""));
                all_ws(store ? vals : null);
                if (consume(OTHER, ",")) {
                    if (store) vals.push({ type: "," });
                    all_ws(store ? vals : null);
                    saw_comma = true;
                }
                else {
                    saw_comma = false;
                }
            }
        };
        
        var typedef = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "typedef")) return;
            var ret = {
                type:   "typedef"
            };
            all_ws();
            ret.typeExtAttrs = extended_attrs();
            all_ws(store, "tpea");
            ret.idlType = type() || error("No type in typedef");
            all_ws();
            var name = consume(ID) || error("No name in typedef");
            ret.name = name.value;
            all_ws();
            consume(OTHER, ";") || error("Unterminated typedef");
            return ret;
        };
        
        var implements_ = function (store) {
            all_ws(store, "pea");
            var target = consume(ID);
            if (!target) return;
            var w = all_ws();
            if (consume(ID, "implements")) {
                var ret = {
                    type:   "implements"
                ,   target: target.value
                };
                all_ws();
                var imp = consume(ID) || error("Incomplete implements statement");
                ret["implements"] = imp.value;
                all_ws();
                consume(OTHER, ";") || error("No terminating ; for implements statement");
                return ret;
            }
            else {
                // rollback
                tokens.unshift(w);
                tokens.unshift(target);
            }
        };
        
        var definition = function (store) {
            return  callback(store)             ||
                    interface_(false, store)    ||
                    partial(store)              ||
                    dictionary(false, store)    ||
                    exception(store)            ||
                    enum_(store)                ||
                    typedef(store)              ||
                    implements_(store)
                    ;
        };
        
        var definitions = function (store) {
            if (!tokens.length) return [];
            var defs = [];
            while (true) {
                var ea = extended_attrs(store ? defs : null)
                ,   def = definition(store ? defs : null);
                if (!def) {
                    if (ea.length) error("Stray extended attributes");
                    break;
                }
                def.extAttrs = ea;
                defs.push(def);
            }
            return defs;
        };
        var res = definitions(opt.ws);
        if (tokens.length) error("Unrecognised tokens");
        return res;
    };

    var inNode = typeof module !== "undefined" && module.exports
    ,   obj = {
            parse:  function (str, opt) {
                if (!opt) opt = {};
                var tokens = tokenise(str);
                return parse(tokens, opt);
            }
    };

    if (inNode) module.exports = obj;
    else        self.WebIDL2 = obj;
}());

define("webidl2", function(){});


define('tmpl!core/css/webidl-oldschool.css', ['handlebars'], function (hb) { return Handlebars.compile('/* --- WEB IDL --- */\npre.idl {\n    border-top: 1px solid #90b8de;\n    border-bottom: 1px solid #90b8de;\n    padding:    1em;\n    line-height:    120%;\n}\n\npre.idl::before {\n    content:    "WebIDL";\n    display:    block;\n    width:      150px;\n    background: #90b8de;\n    color:  #fff;\n    font-family:    sans-serif;\n    padding:    3px;\n    font-weight:    bold;\n    margin: -1em 0 1em -1em;\n}\n\n.idlType {\n    color:  #ff4500;\n    font-weight:    bold;\n    text-decoration:    none;\n}\n\n/*.idlModule*/\n/*.idlModuleID*/\n/*.idlInterface*/\n.idlInterfaceID, .idlDictionaryID, .idlCallbackID, .idlEnumID {\n    font-weight:    bold;\n    color:  #005a9c;\n}\na.idlEnumItem {\n    color:  #000;\n    border-bottom:  1px dotted #ccc;\n    text-decoration: none;\n}\n\n.idlSuperclass {\n    font-style: italic;\n    color:  #005a9c;\n}\n\n/*.idlAttribute*/\n.idlAttrType, .idlFieldType, .idlMemberType {\n    color:  #005a9c;\n}\n.idlAttrName, .idlFieldName, .idlMemberName {\n    color:  #ff4500;\n}\n.idlAttrName a, .idlFieldName a, .idlMemberName a {\n    color:  #ff4500;\n    border-bottom:  1px dotted #ff4500;\n    text-decoration: none;\n}\n\n/*.idlMethod*/\n.idlMethType, .idlCallbackType {\n    color:  #005a9c;\n}\n.idlMethName {\n    color:  #ff4500;\n}\n.idlMethName a {\n    color:  #ff4500;\n    border-bottom:  1px dotted #ff4500;\n    text-decoration: none;\n}\n\n/*.idlCtor*/\n.idlCtorName {\n    color:  #ff4500;\n}\n.idlCtorName a {\n    color:  #ff4500;\n    border-bottom:  1px dotted #ff4500;\n    text-decoration: none;\n}\n\n/*.idlParam*/\n.idlParamType {\n    color:  #005a9c;\n}\n.idlParamName, .idlDefaultValue {\n    font-style: italic;\n}\n\n.extAttr {\n    color:  #666;\n}\n\n/*.idlSectionComment*/\n.idlSectionComment {\n    color: gray;\n}\n\n/*.idlIterable*/\n.idlIterableKeyType, .idlIterableValueType {\n    color:  #005a9c;\n}\n\n/*.idlMaplike*/\n.idlMaplikeKeyType, .idlMaplikeValueType {\n    color:  #005a9c;\n}\n\n/*.idlConst*/\n.idlConstType {\n    color:  #005a9c;\n}\n.idlConstName {\n    color:  #ff4500;\n}\n.idlConstName a {\n    color:  #ff4500;\n    border-bottom:  1px dotted #ff4500;\n    text-decoration: none;\n}\n\n/*.idlException*/\n.idlExceptionID {\n    font-weight:    bold;\n    color:  #c00;\n}\n\n.idlTypedefID, .idlTypedefType {\n    color:  #005a9c;\n}\n\n.idlRaises, .idlRaises a.idlType, .idlRaises a.idlType code, .excName a, .excName a code {\n    color:  #c00;\n    font-weight:    normal;\n}\n\n.excName a {\n    font-family:    monospace;\n}\n\n.idlRaises a.idlType, .excName a.idlType {\n    border-bottom:  1px dotted #c00;\n}\n\n.excGetSetTrue, .excGetSetFalse, .prmNullTrue, .prmNullFalse, .prmOptTrue, .prmOptFalse {\n    width:  45px;\n    text-align: center;\n}\n.excGetSetTrue, .prmNullTrue, .prmOptTrue { color:  #0c0; }\n.excGetSetFalse, .prmNullFalse, .prmOptFalse { color:  #c00; }\n\n.idlImplements a {\n    font-weight:    bold;\n}\n\ndl.attributes, dl.methods, dl.constants, dl.constructors, dl.fields, dl.dictionary-members {\n    margin-left:    2em;\n}\n\n.attributes dt, .methods dt, .constants dt, .constructors dt, .fields dt, .dictionary-members dt {\n    font-weight:    normal;\n}\n\n.attributes dt code, .methods dt code, .constants dt code, .constructors dt code, .fields dt code, .dictionary-members dt code {\n    font-weight:    bold;\n    color:  #000;\n    font-family:    monospace;\n}\n\n.attributes dt code, .fields dt code, .dictionary-members dt code {\n    background:  #ffffd2;\n}\n\n.attributes dt .idlAttrType code, .fields dt .idlFieldType code, .dictionary-members dt .idlMemberType code {\n    color:  #005a9c;\n    background:  transparent;\n    font-family:    inherit;\n    font-weight:    normal;\n    font-style: italic;\n}\n\n.methods dt code {\n    background:  #d9e6f8;\n}\n\n.constants dt code {\n    background:  #ddffd2;\n}\n\n.constructors dt code {\n    background:  #cfc;\n}\n\n.attributes dd, .methods dd, .constants dd, .constructors dd, .fields dd, .dictionary-members dd {\n    margin-bottom:  1em;\n}\n\ntable.parameters, table.exceptions {\n    border-spacing: 0;\n    border-collapse:    collapse;\n    margin: 0.5em 0;\n    width:  100%;\n}\ntable.parameters { border-bottom:  1px solid #90b8de; }\ntable.exceptions { border-bottom:  1px solid #deb890; }\n\n.parameters th, .exceptions th {\n    color:  #fff;\n    padding:    3px 5px;\n    text-align: left;\n    font-weight:    normal;\n    text-shadow:    #666 1px 1px 0;\n}\n.parameters th { background: #90b8de; }\n.exceptions th { background: #deb890; }\n\n.parameters td, .exceptions td {\n    padding:    3px 10px;\n    border-top: 1px solid #ddd;\n    vertical-align: top;\n}\n\n.parameters tr:first-child td, .exceptions tr:first-child td {\n    border-top: none;\n}\n\n.parameters td.prmName, .exceptions td.excName, .exceptions td.excCodeName {\n    width:  100px;\n}\n\n.parameters td.prmType {\n    width:  120px;\n}\n\ntable.exceptions table {\n    border-spacing: 0;\n    border-collapse:    collapse;\n    width:  100%;\n}\n');});


define('tmpl!core/templates/webidl-contiguous/typedef.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlTypedef\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>typedef {{typeExtAttrs obj\n}}<span class=\'idlTypedefType\'>{{idlType obj\n}}</span> <span class=\'idlTypedefID\'>{{#tryLink obj}}{{obj.name}}{{/tryLink}}</span>;</span>');});


define('tmpl!core/templates/webidl-contiguous/implements.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlImplements\'>{{extAttr obj indent\n}}{{idn indent}}<a>{{obj.target}}</a> implements <a>{{obj.implements}}</a>;</span>');});


define('tmpl!core/templates/webidl-contiguous/dict-member.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMember\' id="{{obj.idlId}}" data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}{{qualifiers}}<span class=\'idlMemberType\'>{{idlType obj}}</span> {{pads typePad\n}}<span class=\'idlMemberName\'>{{#tryLink obj}}{{obj.name}}{{/tryLink}}</span>{{#if obj.default\n}} = <span class=\'idlMemberValue\'>{{stringifyIdlConst obj.default}}</span>{{/if}};</span>\n');});


define('tmpl!core/templates/webidl-contiguous/dictionary.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlDictionary\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}{{partial}}dictionary <span class=\'idlDictionaryID\'>{{#tryLink obj}}{{obj.name}}{{/tryLink\n}}</span>{{#if obj.inheritance}} : <span class=\'idlSuperclass\'><a>{{obj.inheritance}}</a></span>{{/if}} {\n{{{children}}}};</span>');});


define('tmpl!core/templates/webidl-contiguous/enum-item.html', ['handlebars'], function (hb) { return Handlebars.compile('{{idn indent}}"<a href="#idl-def-{{parentID}}.{{obj}}" class="idlEnumItem">{{obj}}</a>"{{#if needsComma}},{{/if}}\n');});


define('tmpl!core/templates/webidl-contiguous/enum.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlEnum\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}enum <span class=\'idlEnumID\'>{{#tryLink obj}}{{obj.name}}{{/tryLink}}</span> {\n{{{children}}}{{idn indent}}}};</span>');});


define('tmpl!core/templates/webidl-contiguous/const.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlConst\' id="{{obj.idlId}}" data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}const <span class=\'idlConstType\'>{{idlType obj}}</span>{{nullable}} {{pads pad\n}}<span class=\'idlConstName\'>{{#tryLink obj}}{{obj.name\n}}{{/tryLink}}</span> = <span class=\'idlConstValue\'>{{stringifyIdlConst obj.value}}</span>;</span>\n');});


define('tmpl!core/templates/webidl-contiguous/param.html', ['handlebars'], function (hb) { return Handlebars.compile('{{!-- obj is an instance of https://github.com/darobin/webidl2.js#arguments\n--}}<span class=\'idlParam\'>{{extAttrInline obj\n}}{{optional}}<span class=\'idlParamType\'>{{idlType obj}}{{variadic\n}}</span> <span class=\'idlParamName\'>{{obj.name}}</span>{{#if obj.default\n}} = <span class=\'idlDefaultValue\'>{{stringifyIdlConst obj.default}}</span>{{/if}}</span>');});


define('tmpl!core/templates/webidl-contiguous/callback.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlCallback\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}callback <span class=\'idlCallbackID\'>{{#tryLink obj}}{{obj.name\n}}{{/tryLink}}</span> = <span class=\'idlCallbackType\'>{{idlType obj}}</span> ({{{children}}});</span>');});


define('tmpl!core/templates/webidl-contiguous/method.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMethod\' id="{{obj.idlId}}" data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}{{static}}{{special}}<span class=\'idlMethType\'>{{idlType obj}}</span> {{pads pad\n}}<span class=\'idlMethName\'>{{#tryLink obj}}{{obj.name}}{{/tryLink}}</span>({{{children}}});</span>\n');});


define('tmpl!core/templates/webidl-contiguous/attribute.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlAttribute\' id="{{obj.idlId}}" data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}{{qualifiers}} attribute <span class=\'idlAttrType\'>{{idlType obj}}</span> {{pads\npad}}<span class=\'idlAttrName\'>{{#tryLink obj}}{{escapeAttributeName obj.name}}{{/tryLink}}</span>;</span>\n');});


define('tmpl!core/templates/webidl-contiguous/serializer.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlSerializer\' id="{{obj.idlId}}" data-idl data-title=\'serializer\'>{{extAttr obj indent\n}}{{idn indent}}{{#tryLink obj}}serializer{{/tryLink\n}}{{#if values}} = <span class=\'idlSerializerValues\'>{{values}}</span>{{/if}};</span>\n');});


define('tmpl!core/templates/webidl-contiguous/maplike.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMaplike\' id="{{obj.idlId}}" data-idl data-title=\'maplike\'>{{extAttr obj indent\n}}{{idn indent}}{{qualifiers}}{{#tryLink obj}}maplike{{/tryLink\n}}&lt;{{idlType obj}}&gt;;</span>\n');});


define('tmpl!core/templates/webidl-contiguous/line-comment.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlSectionComment\'>{{idn indent}}//{{comment}}</span>\n');});


define('tmpl!core/templates/webidl-contiguous/multiline-comment.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlSectionComment\'>{{idn indent}}/*{{firstLine}}\n{{#each innerLine}}{{idn ../indent}}{{this}}\n{{/each}}{{idn indent}}{{lastLine}}*/</span>\n');});


define('tmpl!core/templates/webidl-contiguous/field.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlField\' id="{{obj.idlId}}" data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}<span class=\'idlFieldType\'>{{idlType obj}}</span> {{pads\npad}}<span class=\'idlFieldName\'>{{#tryLink obj}}{{obj.name}}{{/tryLink}}</span>;</span>\n');});


define('tmpl!core/templates/webidl-contiguous/exception.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlException\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}exception <span class=\'idlExceptionID\'>{{#tryLink obj}}{{obj.name}}{{/tryLink\n}}</span>{{#if obj.inheritance}} : <span class=\'idlSuperclass\'><a>{{obj.inheritance}}</a></span>{{/if}} {\n{{{children}}}{{idn indent}}}};</span>');});


define('tmpl!core/templates/webidl-contiguous/extended-attribute.html', ['handlebars'], function (hb) { return Handlebars.compile('{{!-- extAttrs should match the structure at https://github.com/darobin/webidl2.js#extended-attributes.\n--}}{{idn indent}}[{{#join extAttrs sep\n  }}<span class=\'{{extAttrClassName}}\'><span class="extAttrName">{{name\n  }}</span>{{#if rhs}}=<span class="extAttrRhs">{{#extAttrRhs rhs}}{{ this }}{{/extAttrRhs}}</span>{{/if\n  }}{{#jsIf arguments}}({{#joinNonWhitespace arguments ", "}}{{param this}}{{/joinNonWhitespace}}){{/jsIf\n}}</span>{{/join}}]{{end}}');});


define('tmpl!core/templates/webidl-contiguous/interface.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlInterface\' id=\'{{obj.idlId}}\' data-idl data-title=\'{{obj.name}}\'>{{extAttr obj indent\n}}{{idn indent}}{{partial}}{{callback}}interface <span class=\'idlInterfaceID\'>{{#tryLink obj}}{{obj.name}}{{/tryLink\n}}</span>{{#if obj.inheritance}} : <span class=\'idlSuperclass\'><a>{{obj.inheritance}}</a></span>{{/if}} {\n{{{children}}}{{idn indent}}}};</span>');});

/*global Handlebars */

// Module core/webidl-contiguous
//  Highlights and links WebIDL marked up inside <pre class="idl">.

// TODO:
//  - It could be useful to report parsed IDL items as events
//  - don't use generated content in the CSS!

define(
    'core/webidl-contiguous',[
        "handlebars"
    ,   "webidl2"
    ,   "tmpl!core/css/webidl-oldschool.css"
    ,   "tmpl!core/templates/webidl-contiguous/typedef.html"
    ,   "tmpl!core/templates/webidl-contiguous/implements.html"
    ,   "tmpl!core/templates/webidl-contiguous/dict-member.html"
    ,   "tmpl!core/templates/webidl-contiguous/dictionary.html"
    ,   "tmpl!core/templates/webidl-contiguous/enum-item.html"
    ,   "tmpl!core/templates/webidl-contiguous/enum.html"
    ,   "tmpl!core/templates/webidl-contiguous/const.html"
    ,   "tmpl!core/templates/webidl-contiguous/param.html"
    ,   "tmpl!core/templates/webidl-contiguous/callback.html"
    ,   "tmpl!core/templates/webidl-contiguous/method.html"
    ,   "tmpl!core/templates/webidl-contiguous/attribute.html"
    ,   "tmpl!core/templates/webidl-contiguous/serializer.html"
    ,   "tmpl!core/templates/webidl-contiguous/maplike.html"
    ,   "tmpl!core/templates/webidl-contiguous/line-comment.html"
    ,   "tmpl!core/templates/webidl-contiguous/multiline-comment.html"
    ,   "tmpl!core/templates/webidl-contiguous/field.html"
    ,   "tmpl!core/templates/webidl-contiguous/exception.html"
    ,   "tmpl!core/templates/webidl-contiguous/extended-attribute.html"
    ,   "tmpl!core/templates/webidl-contiguous/interface.html"
    ],
    function (hb, webidl2, css, idlTypedefTmpl, idlImplementsTmpl, idlDictMemberTmpl, idlDictionaryTmpl,
                   idlEnumItemTmpl, idlEnumTmpl, idlConstTmpl, idlParamTmpl, idlCallbackTmpl, idlMethodTmpl,
              idlAttributeTmpl, idlSerializerTmpl, idlMaplikeTmpl, idlLineCommentTmpl, idlMultiLineCommentTmpl, idlFieldTmpl, idlExceptionTmpl,
              idlExtAttributeTmpl, idlInterfaceTmpl) {
        "use strict";
        function registerHelpers (msg) {
            Handlebars.registerHelper("extAttr", function (obj, indent) {
                return extAttr(obj.extAttrs, indent, /*singleLine=*/false);
            });
            Handlebars.registerHelper("extAttrInline", function (obj) {
                return extAttr(obj.extAttrs, 0, /*singleLine=*/true);
            });
            Handlebars.registerHelper("typeExtAttrs", function (obj) {
                return extAttr(obj.typeExtAttrs, 0, /*singleLine=*/true);
            });
            Handlebars.registerHelper("extAttrClassName", function() {
                var extAttr = this;
                if (extAttr.name === "Constructor" || extAttr.name === "NamedConstructor") {
                    return "idlCtor";
                }
                return "extAttr";
            });
            Handlebars.registerHelper("extAttrRhs", function(rhs, options) {
                if (rhs.type === "identifier") {
                    return options.fn(rhs.value);
                }
                return "(" + rhs.value.map(function(item) { return options.fn(item); }).join(",") + ")";
            });
            Handlebars.registerHelper("param", function (obj) {
                return new Handlebars.SafeString(
                    idlParamTmpl({
                        obj:        obj
                    ,   optional:   obj.optional ? "optional " : ""
                    ,   variadic:   obj.variadic ? "..." : ""
                    }));
            });
            Handlebars.registerHelper("jsIf", function (condition, options) {
                if (condition) {
                    return options.fn(this);
                } else {
                    return options.inverse(this);
                }
            });
            Handlebars.registerHelper("idn", function (indent) {
                return new Handlebars.SafeString(idn(indent));
            });
            Handlebars.registerHelper("idlType", function (obj) {
                return new Handlebars.SafeString(idlType2Html(obj.idlType));
            });
            Handlebars.registerHelper("stringifyIdlConst", function (value) {
                switch (value.type) {
                    case "null": return "null";
                    case "Infinity": return value.negative ? "-Infinity" : "Infinity";
                    case "NaN": return "NaN";
                    case "string":
                    case "number":
                    case "boolean":
                    case "sequence":
                        return JSON.stringify(value.value);
                    default:
                        msg.pub("error", "Unexpected constant value type: " + value.type);
                        return "<Unknown>";
                }
            });
            Handlebars.registerHelper("escapeArgumentName", escapeArgumentName);
            Handlebars.registerHelper("escapeAttributeName", escapeAttributeName);
            Handlebars.registerHelper("escapeIdentifier", escapeIdentifier);
            Handlebars.registerHelper("pads", function (num) {
                return new Handlebars.SafeString(pads(num));
            });
            Handlebars.registerHelper("join", function(arr, between, options) {
                return arr.map(function(elem) { return options.fn(elem); }).join(between);
            });
            Handlebars.registerHelper("joinNonWhitespace", function(arr, between, options) {
                return arr.filter(function(elem) {
                    return elem.type !== "ws";
                }).map(function(elem) {
                    return options.fn(elem);
                }).join(between);
            });
            // A block helper that emits an <a title> around its contents
            // if obj.dfn exists. If it exists, that implies that
            // there's another <dfn> for the object.
            Handlebars.registerHelper("tryLink", function(obj, options) {
                var content = options.fn(this);
                if (obj.dfn) {
                    var result = "<a for='" + Handlebars.Utils.escapeExpression(obj.linkFor || "") + "'";
                    if (obj.name) {
                        result += " data-lt='" + Handlebars.Utils.escapeExpression(obj.name) + "'";
                    }
                    result += ">" + content + "</a>";
                    return result;
                } else {
                    return content;
                }
            });
        }
        function idn (lvl) {
            var str = "";
            for (var i = 0; i < lvl; i++) str += "    ";
            return str;
        }
        function idlType2Html (idlType) {
            if (typeof idlType === "string") {
                return "<a>" + Handlebars.Utils.escapeExpression(idlType) + "</a>";
            }
            if (Array.isArray(idlType)) {
                return idlType.map(idlType2Html).join(", ");
            }
            var nullable = idlType.nullable ? "?" : "";
            if (idlType.union) {
                return '(' + idlType.idlType.map(function(type) {
                    return idlType2Html(type);
                }).join(' or ') + ')' + nullable;
            }
            if (idlType.array) {
                var arrayStr = '';
                for (var i = 0; i < idlType.array; ++i) {
                    if (idlType.nullableArray[i]) {
                        arrayStr += '?';
                    }
                    arrayStr += '[]';
                }
                return idlType2Html({
                        generic: idlType.generic,
                        idlType: idlType.idlType,
                    }) + arrayStr + nullable;
            }
            if (idlType.generic) {
                return Handlebars.Utils.escapeExpression(idlType.generic) + '&lt;' + idlType2Html(idlType.idlType) + '>' + nullable;
            }
            return idlType2Html(idlType.idlType) + nullable;
        }
        function idlType2Text(idlType) {
            if (typeof idlType === 'string') {
                return idlType;
            }
            var nullable = idlType.nullable ? "?" : "";
            if (idlType.union) {
                return '(' + idlType.idlType.map(function(type) {
                    return idlType2Text(type);
                }).join(' or ') + ')' + nullable;
            }
            if (idlType.array) {
                var arrayStr = '';
                for (var i = 0; i < idlType.array; ++i) {
                    if (idlType.nullableArray[i]) {
                        arrayStr += '?';
                    }
                    arrayStr += '[]';
                }
                return idlType2Text({
                        generic: idlType.generic,
                        idlType: idlType.idlType,
                    }) + arrayStr + nullable;
            }
            if (idlType.generic) {
                return idlType.generic + '<' + idlType2Text(idlType.idlType) + '>' + nullable;
            }
            return idlType2Text(idlType.idlType) + nullable;
        }
        function pads (num) {
            // XXX
            //  this might be more simply done as
            //  return Array(num + 1).join(" ")
            var str = "";
            for (var i = 0; i < num; i++) str += " ";
            return str;
        }
        var whitespaceTypes = {"ws": true, "ws-pea": true, "ws-tpea": true, "line-comment": true, "multiline-comment": true};
        function typeIsWhitespace(webIdlType) {
            return whitespaceTypes[webIdlType];
        }
        function extAttr(extAttrs, indent, singleLine) {
            if (extAttrs.length === 0) {
                // If there are no extended attributes, omit the [] entirely.
                return "";
            }
            var opt = {
                extAttrs: extAttrs,
                indent: indent,
                sep: singleLine ? ", " : ",\n " + idn(indent),
                end: singleLine ? " " : "\n",
            };
            return new Handlebars.SafeString(idlExtAttributeTmpl(opt));
        }
        var idlKeywords = [
                "ByteString",
                "DOMString",
                "Date",
                "Infinity",
                "NaN",
                "RegExp",
                "USVString",
                "any",
                "attribute",
                "boolean",
                "byte",
                "callback",
                "const",
                "creator",
                "deleter",
                "dictionary",
                "double",
                "enum",
                "false",
                "float",
                "getter",
                "implements",
                "inherit",
                "interface",
                "iterable",
                "legacycaller",
                "legacyiterable",
                "long",
                "maplike",
                "null",
                "object",
                "octet",
                "optional",
                "or",
                "partial",
                "readonly",
                "required",
                "sequence",
                "serializer",
                "setlike",
                "setter",
                "short",
                "static",
                "stringifier",
                "true",
                "typedef",
                "unrestricted",
                "unsigned",
                "void",
            ]
        ,   ArgumentNameKeyword = [
                "attribute",
                "callback",
                "const",
                "creator",
                "deleter",
                "dictionary",
                "enum",
                "getter",
                "implements",
                "inherit",
                "interface",
                "iterable",
                "legacycaller",
                "legacyiterable",
                "maplike",
                "partial",
                "required",
                "serializer",
                "setlike",
                "setter",
                "static",
                "stringifier",
                "typedef",
                "unrestricted",
            ]
        ,   AttributeNameKeyword = ["required"];
        function escapeArgumentName(argumentName) {
            if (idlKeywords.indexOf(argumentName) !== -1 && ArgumentNameKeyword.indexOf(argumentName) === -1)
                return "_" + argumentName;
            return argumentName;
        }
        function escapeAttributeName(attributeName) {
            if (idlKeywords.indexOf(attributeName) !== -1 && AttributeNameKeyword.indexOf(attributeName) === -1)
                return "_" + attributeName;
            return attributeName;
        }
        function escapeIdentifier(identifier) {
            if (idlKeywords.indexOf(identifier) !== -1)
                return "_" + identifier;
            return identifier;
        }

        // Takes the result of WebIDL2.parse(), an array of definitions.
        function makeMarkup (conf, parse, msg) {
            var attr = { "class": ( conf.useExperimentalStyles ? "def idl" :  "idl" ) };
            var $pre = $("<pre></pre>").attr(attr);
            $pre.html(parse.filter(function(defn) { return !typeIsWhitespace(defn.type); })
                           .map(function(defn) { return writeDefinition(defn, -1, msg); })
                           .join('\n\n'));
            return $pre;
        }

        function writeDefinition (obj, indent, msg) {
            indent++;
            var opt = { indent: indent, obj: obj };
            switch (obj.type) {
                case "typedef":
                    return idlTypedefTmpl(opt);
                case "implements":
                    return idlImplementsTmpl(opt);
                case "interface":
                    return writeInterfaceDefinition(opt);
                case "callback interface":
                    return writeInterfaceDefinition(opt, "callback ");
                case "exception":
                    var maxAttr = 0, maxConst = 0;
                    obj.members.forEach(function (it) {
                        if (typeIsWhitespace(it.type)) {
                            return;
                        }
                        var len = idlType2Text(it.idlType).length;
                        if (it.type === "field")   maxAttr = (len > maxAttr) ? len : maxAttr;
                        else if (it.type === "const") maxConst = (len > maxConst) ? len : maxConst;
                    });
                    var children = obj.members
                                      .map(function (ch) {
                                          switch (ch.type) {
                                            case "field": return writeField(ch, maxAttr, indent + 1);
                                            case "const": return writeConst(ch, maxConst, indent + 1);
                                            case "line-comment": return writeLineComment(ch, indent + 1);
                                            case "multiline-comment": return writeMultiLineComment(ch, indent + 1);
                                            case "ws": return writeBlankLines(ch);
                                            case "ws-pea": break;
                                            default:
                                                throw new Error('Unexpected type in exception: ' + it.type);
                                          }
                                      })
                                      .join("")
                    ;
                    return idlExceptionTmpl({ obj: obj, indent: indent, children: children });
                case "dictionary":
                    var maxQualifiers = 0, maxType = 0;
                    var members = obj.members.filter(function(member) { return !typeIsWhitespace(member.type); });
                    obj.members.forEach(function (it) {
                        if (typeIsWhitespace(it.type)) {
                            return;
                        }
                        var qualifiers = '';
                        if (it.required) qualifiers += 'required ';
                        if (maxQualifiers < qualifiers.length) maxQualifiers = qualifiers.length;

                        var typeLen = idlType2Text(it.idlType).length;
                        if (maxType < typeLen) maxType = typeLen;
                    });
                    var children = obj.members
                                      .map(function (it) {
                                          switch(it.type) {
                                            case "field": return writeMember(it, maxQualifiers, maxType, indent + 1);
                                            case "line-comment": return writeLineComment(it, indent + 1);
                                            case "multiline-comment": return writeMultiLineComment(it, indent + 1);
                                            case "ws": return writeBlankLines(it);
                                            case "ws-pea": break;
                                            default:
                                                throw new Error('Unexpected type in dictionary: ' + it.type);
                                          }
                                      })
                                      .join("")
                    ;
                    return idlDictionaryTmpl({ obj: obj, indent: indent, children: children, partial: obj.partial ? "partial " : "" });
                case "callback":
                    var params = obj.arguments
                                    .filter(function(it) {
                                        return !typeIsWhitespace(it.type);
                                    })
                                    .map(function (it) {
                                        return idlParamTmpl({
                                            obj:        it
                                        ,   optional:   it.optional ? "optional " : ""
                                        ,   variadic:   it.variadic ? "..." : ""
                                        });
                                    })
                                    .join(", ");
                    return idlCallbackTmpl({
                        obj:        obj
                    ,   indent:     indent
                    ,   children:   params
                    });
                case "enum":
                    var children = "";
                    for (var i = 0; i < obj.values.length; i++) {
                        var item = obj.values[i];
                        switch (item.type) {
                            case undefined:
                                var needsComma = false;
                                for (var j = i + 1; j < obj.values.length; j++) {
                                    var lookahead = obj.values[j];
                                    if (lookahead.type === undefined) break;
                                    if (lookahead.type === ",") {
                                        needsComma = true;
                                        break;
                                    }
                                }
                                children += idlEnumItemTmpl({
                                    obj: item,
                                    parentID: obj.name,
                                    indent: indent + 1,
                                    needsComma: needsComma
                                });
                                break;
                            case "line-comment": children += writeLineComment(item, indent + 1); break;
                            case "multiline-comment": children += writeMultiLineComment(item, indent + 1); break;
                            case "ws": children += writeBlankLines(item); break;
                            case ",":
                            case "ws-pea": break;
                            default:
                                throw new Error('Unexpected type in exception: ' + item.type);
                        }
                    }
                    return idlEnumTmpl({obj: obj, indent: indent, children: children });
                default:
                    msg.pub("error", "Unexpected object type " + obj.type + " in " + JSON.stringify(obj));
                    return "";
            }
        }

        function writeInterfaceDefinition(opt, callback) {
            var obj = opt.obj, indent = opt.indent;
            var maxAttr = 0, maxMeth = 0, maxConst = 0;
            obj.members.forEach(function (it) {
                if (typeIsWhitespace(it.type) || it.type === "serializer" || it.type === "maplike") {
                    return;
                }
                var len = idlType2Text(it.idlType).length;
                if (it.static) len += 7;
                if (it.type === "attribute") maxAttr = (len > maxAttr) ? len : maxAttr;
                else if (it.type === "operation") maxMeth = (len > maxMeth) ? len : maxMeth;
                else if (it.type === "const") maxConst = (len > maxConst) ? len : maxConst;
            });
            var children = obj.members
                              .map(function (ch) {
                                  switch (ch.type) {
                                      case "attribute": return writeAttribute(ch, maxAttr, indent + 1);
                                      case "operation": return writeMethod(ch, maxMeth, indent + 1);
                                      case "const": return writeConst(ch, maxConst, indent + 1);
                                      case "serializer": return writeSerializer(ch, indent + 1);
                                      case "maplike": return writeMaplike(ch, indent + 1);
                                      case "ws": return writeBlankLines(ch);
                                      case "line-comment": return writeLineComment(ch, indent + 1);
                                      case "multiline-comment": return writeMultiLineComment(ch, indent + 1);
                                      default: throw new Error("Unexpected member type: " + ch.type);
                                  }
                              })
                              .join("")
            ;
            return idlInterfaceTmpl({
                obj:        obj
            ,   indent:     indent
            ,   partial:    obj.partial ? "partial " : ""
            ,   callback:   callback
            ,   children:   children
            });
        }

        function writeField (attr, max, indent) {
            var pad = max - idlType2Text(attr.idlType).length;
            return idlFieldTmpl({
                obj:        attr
            ,   indent:     indent
            ,   pad:        pad
            });
        }

        function writeAttribute (attr, max, indent) {
            var len = idlType2Text(attr.idlType).length;
            var pad = max - len;
            var qualifiers = "";
            if (attr.static) qualifiers += "static ";
            if (attr.stringifier) qualifiers += "stringifier ";
            if (attr.inherit) qualifiers += "inherit ";
            if (attr.readonly) qualifiers += "readonly ";
            qualifiers += "           ";
            qualifiers = qualifiers.slice(0, 11);
            return idlAttributeTmpl({
                obj:            attr
            ,   indent:         indent
            ,   qualifiers:     qualifiers
            ,   pad:            pad
            });
        }

        function writeMethod (meth, max, indent) {
            var params = meth.arguments
                            .filter(function (it) {
                                return !typeIsWhitespace(it.type);
                            }).map(function (it) {
                                return idlParamTmpl({
                                    obj:        it
                                ,   optional:   it.optional ? "optional " : ""
                                ,   variadic:   it.variadic ? "..." : ""
                                });
                            })
                            .join(", ");
            var len = idlType2Text(meth.idlType).length;
            if (meth.static) len += 7;
            var specialProps = ["getter", "setter", "deleter", "legacycaller", "serializer", "stringifier"];
            var special = "";
            for (var i in specialProps) {
                if (meth[specialProps[i]]) {
                    special = specialProps[i] + " ";
                    len += special.length;
                    break;
                }
            }
            var pad = max - len;
            return idlMethodTmpl({
                obj:        meth
            ,   indent:     indent
            ,   "static":   meth.static ? "static " : ""
            ,   special:    special
            ,   pad:        pad
            ,   children:   params
            });
        }

        function writeConst (cons, max, indent) {
            var pad = max - idlType2Text(cons.idlType).length;
            if (cons.nullable) pad--;
            return idlConstTmpl({ obj: cons, indent: indent, pad: pad, nullable: cons.nullable ? "?" : ""});
        }

        // Writes a single blank line if whitespace includes at least one blank line.
        function writeBlankLines(whitespace) {
            if (/\n.*\n/.test(whitespace.value)) {
                // Members end with a newline, so we only need 1 extra one to get a blank line.
                return "\n";
            }
            return "";
        }

        function writeLineComment (comment, indent) {
            return idlLineCommentTmpl({ indent: indent, comment: comment.value});
        }

        function writeMultiLineComment (comment, indent) {
            // Split the multi-line comment into lines so we can indent it properly.
            var lines = comment.value.split(/\r\n|\r|\n/);
            if (lines.length === 0) {
                return "";
            } else if (lines.length === 1) {
                return idlLineCommentTmpl({ indent: indent, comment: lines[0]});
            }
            var initialSpaces = Math.max(0, /^ */.exec(lines[1])[0].length - 3);
            function trimInitialSpace(line) {
                return line.slice(initialSpaces);
            }
            return idlMultiLineCommentTmpl({
                indent: indent,
                firstLine: lines[0],
                lastLine: trimInitialSpace(lines[lines.length - 1]),
                innerLine: lines.slice(1, -1).map(trimInitialSpace) });
        }

        function writeSerializer (serializer, indent) {
            var values = "";
            if (serializer.patternMap) {
                values = "{" + serializer.names.join(", ") + "}";
            }
            else if (serializer.patternList) {
                values = "[" + listValues.join(", ") + "]";
            }
            else if (serializer.name) {
                values = serializer.name;
            }
            return idlSerializerTmpl({
                obj:        serializer
            ,   indent:     indent
            ,   values:     values
            });
        }

        function writeMaplike (maplike, indent) {
            var qualifiers = "";
            if (maplike.readonly) qualifiers += "readonly ";
            return idlMaplikeTmpl({
                obj:        maplike
            ,   qualifiers:     qualifiers
            ,   indent:     indent
            });
        }

        function writeMember (memb, maxQualifiers, maxType, indent) {
            var opt = { obj: memb, indent: indent };
            opt.typePad = maxType - idlType2Text(memb.idlType).length;
            if (memb.required) opt.qualifiers = 'required ';
            else opt.qualifiers = '         ';
            opt.qualifiers = opt.qualifiers.slice(0, maxQualifiers);
            return idlDictMemberTmpl(opt);
        }

        // Each entity defined in IDL is either a top- or second-level entity:
        // Interface or Interface.member. This function finds the <dfn>
        // element defining each entity and attaches it to the entity's
        // 'refTitle' property, and records that it describes an IDL entity by
        // adding a [data-idl] attribute.
        function linkDefinitions(parse, definitionMap, parent, msg) {
            parse.forEach(function(defn) {
                var name;
                switch (defn.type) {
                    // Top-level entities with linkable members.
                    case "callback interface":
                    case "dictionary":
                    case "exception":
                    case "interface":
                        linkDefinitions(defn.members, definitionMap, defn.name, msg);
                        name = defn.name;
                        defn.idlId = "idl-def-" + name.toLowerCase();
                        break;

                    case "enum":
                        name = defn.name;
                        defn.values.filter(function (v) { return v.type === undefined;})
                                   .forEach(function(v) {
                            v.dfn = findDfn(name, v, definitionMap, msg);
                        });
                        defn.idlId = "idl-def-" + name.toLowerCase();
                        break;

                    // Top-level entities without linkable members.
                    case "callback":
                    case "typedef":
                        name = defn.name;
                        defn.idlId = "idl-def-" + name.toLowerCase();
                        break;

                    // Members of top-level entities.
                    case "attribute":
                    case "const":
                    case "field":
                        name = defn.name;
                        defn.idlId = "idl-def-" + parent.toLowerCase() + "-" + name.toLowerCase();
                        break;
                    case "operation":
                        if (defn.name) {
                            name = defn.name;
                        } else if (defn.getter || defn.setter || defn.deleter ||
                                   defn.legacycaller || defn.stringifier ||
                                   defn.serializer ) {
                            name = "";
                        }
                        defn.idlId = ("idl-def-" + parent.toLowerCase() + "-" +
                                      name.toLowerCase() + '(' +
                                      defn.arguments.filter(function(arg) {
                                          return !typeIsWhitespace(arg.type);
                                      }).map(function(arg) {
                                          var optional = arg.optional ? "optional-" : "";
                                          var variadic = arg.variadic ? "..." : "";
                                          return optional + idlType2Text(arg.idlType).toLowerCase() + variadic;
                                      }).join(',').replace(/\s/g, '_') + ')');
                        break;
                    case "maplike":
                        name = "maplike";
                        defn.idlId = ("idl-def-" + parent + "-" + name).toLowerCase();
                    case "iterator":
                        name = "iterator";
                        defn.idlId = "idl-def-" + parent.toLowerCase() + "-" + name.toLowerCase();
                        break;
                    case "serializer":
                        name = "serializer";
                        defn.idlId = "idl-def-" + parent.toLowerCase() + "-" + name.toLowerCase();
                        break;

                    case "implements":
                    case "ws":
                    case "ws-pea":
                    case "ws-tpea":
                    case "line-comment":
                    case "multiline-comment":
                        // Nothing to link here.
                        return;
                    default:
                        msg.pub("error", "Unexpected type when computing refTitles: " + defn.type);
                        return;
                }
                if (parent) {
                    defn.linkFor = parent;
                }
                defn.dfn = findDfn(parent, name, definitionMap, msg);
            });
        }

        // This function looks for a <dfn> element whose title is 'name' and
        // that is "for" 'parent', which is the empty string when 'name'
        // refers to a top-level entity. For top-level entities, <dfn>
        // elements that inherit a non-empty [dfn-for] attribute are also
        // counted as matching.
        //
        // When a matching <dfn> is found, it's given <code> formatting,
        // marked as an IDL definition, and returned.  If no <dfn> is found,
        // the function returns 'undefined'.
        function findDfn(parent, name, definitionMap, msg) {
            parent = parent.toLowerCase();
            name = name.toLowerCase();
            var dfnForArray = definitionMap[name];
            var dfns = [];
            if (dfnForArray) {
                // Definitions that have a title and [for] that exactly match the
                // IDL entity:
                dfns = dfnForArray.filter(function(dfn) {
                    return dfn.attr('data-dfn-for') === parent;
                });
                // If this is a top-level entity, and we didn't find anything with
                // an explicitly empty [for], try <dfn> that inherited a [for].
                if (dfns.length === 0 && parent === "" && dfnForArray.length === 1) {
                    dfns = dfnForArray;
                }
            }
            // If we haven't found any definitions with explicit [for]
            // and [title], look for a dotted definition, "parent.name".
            if (dfns.length === 0 && parent !== "") {
                var dottedName = parent + '.' + name;
                dfnForArray = definitionMap[dottedName];
                if (dfnForArray !== undefined && dfnForArray.length === 1) {
                    dfns = dfnForArray;
                    // Found it: update the definition to specify its [for] and data-lt.
                    delete definitionMap[dottedName];
                    dfns[0].attr('data-dfn-for', parent);
                    dfns[0].attr('data-lt', name);
                    if (definitionMap[name] === undefined) {
                        definitionMap[name] = [];
                    }
                    definitionMap[name].push(dfns[0]);
                }
            }
            if (dfns.length > 1) {
                msg.pub("error", "Multiple <dfn>s for " + name + (parent ? " in " + parent : ""));
            }
            if (dfns.length === 0) {
                return undefined;
            }
            var dfn = dfns[0];
            // Mark the definition as code.
            dfn.attr('id', "dom-" + (parent ? parent + "-" : "") + name)
            dfn.attr('data-idl', '');
            dfn.attr('data-dfn-for', parent);
            if (dfn.children('code').length === 0 && dfn.parents('code').length === 0)
                dfn.wrapInner('<code></code>');
            return dfn;
        }

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/webidl-contiguous");
                registerHelpers(msg);
                var $idl = $("pre.idl", doc)
                ,   finish = function () {
                        msg.pub("end", "core/webidl-contiguous");
                        cb();
                    };
                if (!$idl.length) return finish();
                if (!$(".idl", doc).not("pre").length) {
                    $(doc).find("head link").first().before($("<style/>").text(css));
                }

                var idlNames = [];
                $idl.each(function () {
                    var parse;
                    try {
                        parse = window.WebIDL2.parse($(this).text(), {ws: true});
                    } catch(e) {
                        msg.pub("error", "Failed to parse <pre>" + $idl.text() + "</pre> as IDL: " + (e.stack || e));
                        // Skip this <pre> and move on to the next one.
                        return;
                    }
                    linkDefinitions(parse, conf.definitionMap, "", msg);
                    var $df = makeMarkup(conf, parse, msg);
                    $df.attr({id: this.id});
                    $df.find('.idlAttribute,.idlCallback,.idlConst,.idlDictionary,.idlEnum,.idlException,.idlField,.idlInterface,.idlMember,.idlMethod,.idlSerializer,.idlMaplike,.idlTypedef')
                        .each(function() {
                            var elem = $(this);
                            var title = elem.attr('data-title').toLowerCase();
                            // Select the nearest ancestor element that can contain members.
                            var parent = elem.parent().closest('.idlDictionary,.idlEnum,.idlException,.idlInterface');
                            if (parent.length) {
                                elem.attr('data-dfn-for', parent.attr('data-title').toLowerCase());
                            }
                            if (!conf.definitionMap[title]) {
                                conf.definitionMap[title] = [];
                            }
                            conf.definitionMap[title].push(elem);
                        });
                    $(this).replaceWith($df);
                });
                doc.normalize();
                finish();
            }
        };
    }
);


define('tmpl!core/templates/webidl/module.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlModule\'>{{extAttr obj indent true }}{{idn indent}}module <span class=\'idlModuleID\'>{{obj.id}}</span> {\n{{#each obj.children}}{{asWebIDL proc this indent}}{{/each}}\n{{idn indent}}};</span>\n');});


define('tmpl!core/templates/webidl/typedef.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlTypedef\' id=\'idl-def-{{obj.refId}}\'>typedef {{extAttr obj 0 false\n}}<span class=\'idlTypedefType\'>{{datatype obj.datatype\n}}</span>{{arr}}{{nullable}} <span class=\'idlTypedefID\'>{{obj.id}}</span>;</span>\n');});


define('tmpl!core/templates/webidl/implements.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlImplements\'>{{extAttr obj indent true}}{{idn indent}}<a>{{obj.id}}</a> implements <a>{{obj.datatype}}</a>;</span>\n');});


define('tmpl!core/templates/webidl/dict-member.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMember\'>{{extAttr obj indent true\n}}{{idn indent}}{{declaration}} <span class=\'idlMemberType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}</span> {{pads pad\n}}<span class=\'idlMemberName\'><a href=\'#{{curLnk}}{{obj.refId}}\'>{{obj.id}}</a></span>{{#if obj.defaultValue\n}} = <span class=\'idlMemberValue\'>{{obj.defaultValue}}</span>{{/if}};</span>\n');});


define('tmpl!core/templates/webidl/dictionary.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlDictionary\' id=\'idl-def-{{obj.refId}}\'>{{extAttr obj indent true\n}}{{idn indent}}{{partial}}dictionary <span class=\'idlDictionaryID\'>{{obj.id}}</span>{{superclasses obj}} {\n{{{children}}}};</span>\n');});


define('tmpl!core/templates/webidl/enum-item.html', ['handlebars'], function (hb) { return Handlebars.compile('{{idn indent}}"<a href="#idl-def-{{parentID}}.{{obj.refId}}" class="idlEnumItem">{{obj.id}}</a>"');});


define('tmpl!core/templates/webidl/enum.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlEnum\' id=\'idl-def-{{obj.refId}}\'>{{extAttr obj indent true\n}}{{idn indent}}enum <span class=\'idlEnumID\'>{{obj.id}}</span> {\n{{{children}}}\n{{idn indent}}}};');});


define('tmpl!core/templates/webidl/const.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlConst\'>{{extAttr obj indent true\n}}{{idn indent}}const <span class=\'idlConstType\'><a>{{obj.datatype}}</a>{{nullable}}</span> {{pads pad\n}}<span class=\'idlConstName\'><a href=\'#{{curLnk}}{{obj.refId}}\'>{{obj.id\n}}</a></span> = <span class=\'idlConstValue\'>{{obj.value}}</span>;</span>\n');});


define('tmpl!core/templates/webidl/param.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlParam\'>{{extAttr obj 0 false\n}}{{optional}}<span class=\'idlParamType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}{{variadic\n}}</span> <span class=\'idlParamName\'>{{obj.id}}</span>{{#if obj.defaultValue\n}} = <span class=\'idlDefaultValue\'>{{obj.defaultValue}}</span>{{/if}}</span>');});


define('tmpl!core/templates/webidl/callback.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlCallback\' id=\'idl-def-{{obj.refId}}\'>{{extAttr obj indent true\n}}{{idn indent}}callback <span class=\'idlCallbackID\'>{{obj.id\n}}</span> = <span class=\'idlCallbackType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}</span> ({{{children}}});</span>\n');});


define('tmpl!core/templates/webidl/method.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMethod\'>{{extAttr obj indent true\n}}{{idn indent}}{{static}}<span class=\'idlMethType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}</span> {{pads pad\n}}<span class=\'idlMethName\'><a href=\'#{{id}}\'>{{obj.id}}</a></span> ({{{children}}});</span>\n');});


define('tmpl!core/templates/webidl/constructor.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlCtor\'>{{extAttr obj indent true\n}}{{idn indent}} <span class=\'idlCtorKeyword\'>{{keyword}}</span><span class=\'idlCtorName\'><a href=\'#{{id}}\'>{{name}}</a></span>{{param obj children}}</span>');});


define('tmpl!core/templates/webidl/attribute.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlAttribute\'>{{extAttr obj indent true\n}}{{idn indent}}{{declaration}} attribute <span class=\'idlAttrType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}</span> {{pads\npad}}<span class=\'idlAttrName\'><a href=\'#{{href}}\'>{{obj.id}}</a></span>;</span>\n');});


define('tmpl!core/templates/webidl/serializer.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlSerializer\'>{{extAttr obj indent true\n}}{{idn indent}}serializer{{#if values}} = <span class=\'idlSerializerValues\'>{{values}}</span>{{/if}};</span>\n');});


define('tmpl!core/templates/webidl/iterable.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlIterable\'>{{extAttr obj indent true\n}}{{idn indent}}iterable&lt;<span class=\'idlIterableKeyType\'>{{datatype obj.key}}</span>{{#if obj.value}},<span class=\'idlIterableValueType\'>{{datatype obj.value}}</span>{{/if}}&gt;;</span>\n');});


define('tmpl!core/templates/webidl/maplike.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlMaplike\'>{{extAttr obj indent true\n}}{{idn indent}}{{readonly}}maplike&lt;<span class=\'idlMaplikeKeyType\'>{{datatype obj.key}}</span>, <span class=\'idlMaplikeValueType\'>{{datatype obj.value}}</span>&gt;;</span>\n');});


define('tmpl!core/templates/webidl/comment.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlSectionComment\'>{{extAttr obj indent true\n}}{{idn indent}}// {{comment}}</span>\n');});


define('tmpl!core/templates/webidl/field.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlField\'>{{extAttr obj indent true\n}}{{idn indent}}<span class=\'idlFieldType\'>{{datatype obj.datatype}}{{arr}}{{nullable}}</span> {{pads\npad}}<span class=\'idlFieldName\'><a href=\'#{{href}}\'>{{obj.id}}</a></span>;</span>\n');});


define('tmpl!core/templates/webidl/exception.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlException\' id=\'idl-def-{{obj.refId}}\'>{{extAttr obj indent true\n}}{{idn indent}}exception <span class=\'idlExceptionID\'>{{obj.id}}</span>{{superclasses obj}} {\n{{{children}}}{{idn indent}}}};</span>');});


define('tmpl!core/templates/webidl/interface.html', ['handlebars'], function (hb) { return Handlebars.compile('<span class=\'idlInterface\' id=\'{{id}}\'>{{extAttr obj indent true ctor\n}}{{idn indent}}{{partial}}{{callback}}interface <span class=\'idlInterfaceID\'>{{obj.id}}</span>{{superclasses obj}} {\n{{{children}}}{{idn indent}}}};</span>');});

/*global Handlebars, simpleNode */

// Module core/webidl-oldschool
//  Transforms specific markup into the complex old school rendering for API information.

// TODO:
//  - It could be useful to report parsed IDL items as events
//  - don't use generated content in the CSS!

var sn;
define(
    'core/webidl-oldschool',[
        "handlebars"
    ,   "tmpl!core/css/webidl-oldschool.css"
    ,   "tmpl!core/templates/webidl/module.html"
    ,   "tmpl!core/templates/webidl/typedef.html"
    ,   "tmpl!core/templates/webidl/implements.html"
    ,   "tmpl!core/templates/webidl/dict-member.html"
    ,   "tmpl!core/templates/webidl/dictionary.html"
    ,   "tmpl!core/templates/webidl/enum-item.html"
    ,   "tmpl!core/templates/webidl/enum.html"
    ,   "tmpl!core/templates/webidl/const.html"
    ,   "tmpl!core/templates/webidl/param.html"
    ,   "tmpl!core/templates/webidl/callback.html"
    ,   "tmpl!core/templates/webidl/method.html"
    ,   "tmpl!core/templates/webidl/constructor.html"
    ,   "tmpl!core/templates/webidl/attribute.html"
    ,   "tmpl!core/templates/webidl/serializer.html"
    ,   "tmpl!core/templates/webidl/iterable.html"
    ,   "tmpl!core/templates/webidl/maplike.html"
    ,   "tmpl!core/templates/webidl/comment.html"
    ,   "tmpl!core/templates/webidl/field.html"
    ,   "tmpl!core/templates/webidl/exception.html"
    ,   "tmpl!core/templates/webidl/interface.html"
    ],
    function (hb, css, idlModuleTmpl, idlTypedefTmpl, idlImplementsTmpl, idlDictMemberTmpl, idlDictionaryTmpl,
                   idlEnumItemTmpl, idlEnumTmpl, idlConstTmpl, idlParamTmpl, idlCallbackTmpl, idlMethodTmpl,
              idlConstructorTmpl, idlAttributeTmpl, idlSerializerTmpl, idlIterableTmpl, idlMaplikeTmpl, idlCommentTmpl, idlFieldTmpl, idlExceptionTmpl, idlInterfaceTmpl) {
        var WebIDLProcessor = function (cfg) {
                this.parent = { type: "module", id: "outermost", children: [] };
                if (!cfg) cfg = {};
                for (var k in cfg) if (cfg.hasOwnProperty(k)) this[k] = cfg[k];

                Handlebars.registerHelper("extAttr", function (obj, indent, nl, ctor) {
                    var ret = "";
                    if (obj.extendedAttributes) {
                        ret += idn(indent) + "[<span class='extAttr'>" + obj.extendedAttributes + "</span>" +
                               (typeof ctor === 'string' && ctor.length ? ",\n" + ctor : "") + "]" + (nl ? "\n" : " ");
                    }
                    else if (typeof ctor === 'string' && ctor.length) {
                        ret += idn(indent) + "[" + ctor + "]" + (nl ? "\n" : " ");
                    }
                    return new Handlebars.SafeString(ret);
                });
                Handlebars.registerHelper("param", function (obj, children) {
                    var param = "";
                    if (children) param += " (" + children + ")";
                    return new Handlebars.SafeString(param);
                });
                Handlebars.registerHelper("idn", function (indent) {
                    return new Handlebars.SafeString(idn(indent));
                });
                Handlebars.registerHelper("asWebIDL", function (proc, obj, indent) {
                    return new Handlebars.SafeString(proc.writeAsWebIDL(obj, indent));
                });
                Handlebars.registerHelper("datatype", function (text) {
                    return new Handlebars.SafeString(datatype(text));
                });
                Handlebars.registerHelper("pads", function (num) {
                    return new Handlebars.SafeString(pads(num));
                });
                Handlebars.registerHelper("superclasses", function (obj) {
                    if (!obj.superclasses || !obj.superclasses.length) return "";
                    var str = " : " +
                              obj.superclasses.map(function (it) {
                                                    return "<span class='idlSuperclass'><a>" + it + "</a></span>";
                                                  }).join(", ")
                    ;
                    return new Handlebars.SafeString(str);
                });
            }
        ,   idn = function (lvl) {
                var str = "";
                for (var i = 0; i < lvl; i++) str += "    ";
                return str;
            }
        ,   norm = function (str) {
                return str.replace(/^\s+/, "").replace(/\s+$/, "").split(/\s+/).join(" ");
            }
        ,   arrsq = function (obj) {
                var str = "";
                for (var i = 0, n = obj.arrayCount; i < n; i++) str += "[]";
                return str;
            }
        ,   datatype = function (text) {
                if ($.isArray(text)) {
                    var arr = [];
                    for (var i = 0, n = text.length; i < n; i++) arr.push(datatype(text[i]));
                    return "(" + arr.join(" or ") + ")";
                }
                else {
                    var matched = /^(sequence|Promise|CancelablePromise|EventStream|FrozenArray)<(.+)>$/.exec(text);
                    if (matched)
                        return matched[1] + "&lt;<a>" + datatype(matched[2]) + "</a>&gt;";

                    return "<a>" + text + "</a>";
                }
            }
        ,   pads = function (num) {
                // XXX
                //  this might be more simply done as
                //  return Array(num + 1).join(" ")
                var str = "";
                for (var i = 0; i < num; i++) str += " ";
                return str;
            }
        ;
        WebIDLProcessor.prototype = {
            setID:  function (obj, match) {
                obj.id = match;
                obj.refId = obj.id.replace(/[^a-zA-Z0-9_\-]/g, "").replace(/^[0-9\-]*/, "");
                obj.unescapedId = (obj.id[0] == "_" ? obj.id.slice(1) : obj.id);
            }
        ,   nullable:   function (obj, type) {
                obj.nullable = false;
                if (/\?$/.test(type)) {
                    type = type.replace(/\?$/, "");
                    obj.nullable = true;
                }
                return type;
            }
        ,   array:   function (obj, type) {
                obj.array = false;
                if (/\[\]$/.test(type)) {
                    obj.arrayCount = 0;
                    type = type.replace(/(?:\[\])/g, function () {
                        obj.arrayCount++;
                        return "";
                    });
                    obj.array = true;
                }
                return type;
            }
        ,   params: function (prm, $dd, obj) {
                var p = {};
                prm = this.parseExtendedAttributes(prm, p);
                // either up to end of string, or up to ,
                // var re = /^\s*(?:in\s+)?([^,]+)\s+\b([^,\s]+)\s*(?:,)?\s*/;
                var re = /^\s*(?:in\s+)?([^,=]+)\s+\b([^,]+)\s*(?:,)?\s*/;
                var match = re.exec(prm);
                if (match) {
                    prm = prm.replace(re, "");
                    var type = match[1]
                    ,   name = match[2]
                    ,   components = name.split(/\s*=\s*/)
                    ,   deflt = null
                    ;
                    if (components.length === 1) name = name.replace(/\s+/g, "");
                    else {
                        name = components[0];
                        deflt = components[1];
                    }
                    this.parseDatatype(p, type);
                    p.defaultValue = deflt;
                    this.setID(p, name);
                    if ($dd) p.description = $dd.contents();
                    obj.params.push(p);
                }
                else {
                    this.msg.pub("error", "Expected parameter list, got: " + prm);
                    return false;
                }
                return prm;
            }
        ,   optional:   function (p) {
                if (p.isUnionType) {
                    p.optional = false;
                    return false;
                }
                else {
                    var pkw = p.datatype.split(/\s+/)
                    ,   idx = pkw.indexOf("optional")
                    ,   isOptional = false;
                    if (idx > -1) {
                        isOptional = true;
                        pkw.splice(idx, 1);
                        p.datatype = pkw.join(" ");
                    }
                    p.optional = isOptional;
                    return isOptional;
                }
            }


        ,   definition:    function ($idl) {
                var def = { children: [] }
                ,   str = $idl.attr("title")
                ,   id = $idl.attr("id");
                if (!str) this.msg.pub("error", "No IDL definition in element.");
                str = this.parseExtendedAttributes(str, def);
                if (str.indexOf("partial") === 0) { // Could be interface or dictionary
                    var defType = str.slice(8);
                    if  (defType.indexOf("interface") === 0)        this.processInterface(def, str, $idl, { partial : true });
                    else if (defType.indexOf("dictionary") === 0)   this.dictionary(def, defType, $idl, { partial : true });
                    else    this.msg.pub("error", "Expected definition, got: " + str);
                }
                else if      (str.indexOf("interface") === 0 ||
                         /^callback\s+interface\b/.test(str))   this.processInterface(def, str, $idl);
                else if (str.indexOf("exception") === 0)        this.exception(def, str, $idl);
                else if (str.indexOf("dictionary") === 0)       this.dictionary(def, str, $idl);
                else if (str.indexOf("callback") === 0)         this.callback(def, str, $idl);
                else if (str.indexOf("enum") === 0)             this.processEnum(def, str, $idl);
                else if (str.indexOf("typedef") === 0)          this.typedef(def, str, $idl);
                else if (/\bimplements\b/.test(str))            this.processImplements(def, str, $idl);
                else    this.msg.pub("error", "Expected definition, got: " + str);
                this.parent.children.push(def);
                this.processMembers(def, $idl);
                if (id) def.htmlID = id;
                return def;
            },

            processInterface:  function (obj, str, $idl, opt) {
                opt = opt || {};
                obj.type = "interface";
                obj.partial = opt.partial || false;

                var match = /^\s*(?:(partial|callback)\s+)?interface\s+([A-Za-z][A-Za-z0-9]*)(?:\s+:\s*([^{]+)\s*)?/.exec(str);
                if (match) {
                    obj.callback = !!match[1] && match[1] === "callback";
                    this.setID(obj, match[2]);
                    if ($idl.attr('data-merge')) obj.merge = $idl.attr('data-merge').split(' ');
                    if (match[3]) obj.superclasses = match[3].split(/\s*,\s*/);
                }
                else this.msg.pub("error", "Expected interface, got: " + str);
                return obj;
            },

            dictionary:  function (obj, str, $idl, opt) {
                opt = opt || {};
                obj.partial = opt.partial || false;
                return this.excDic("dictionary", obj, str, $idl);
            },

            exception:  function (obj, str, $idl) {
                return this.excDic("exception", obj, str, $idl);
            },

            excDic:  function (type, obj, str) {
                obj.type = type;
                var re = new RegExp("^\\s*" + type + "\\s+([A-Za-z][A-Za-z0-9]*)(?:\\s+:\\s*([^{]+)\\s*)?\\s*")
                ,   match = re.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    if (match[2]) obj.superclasses = match[2].split(/\s*,\s*/);
                }
                else this.msg.pub("error", "Expected " + type + ", got: " + str);
                return obj;
            },

            callback:  function (obj, str) {
                obj.type = "callback";
                var match = /^\s*callback\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*\b(.*?)\s*$/.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    var type = match[2];
                    this.parseDatatype(obj, type);
                }
                else this.msg.pub("error", "Expected callback, got: " + str);
                return obj;
            },

            processEnum:  function (obj, str) {
                obj.type = "enum";
                var match = /^\s*enum\s+([A-Za-z][A-Za-z0-9]*)\s*$/.exec(str);
                if (match) this.setID(obj, match[1]);
                else this.msg.pub("error", "Expected enum, got: " + str);
                return obj;
            },

            typedef:    function (obj, str, $idl) {
                obj.type = "typedef";
                str = str.replace(/^\s*typedef\s+/, "");
                str = this.parseExtendedAttributes(str, obj);
                var match = /^(.+)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    var type = match[1];
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[2]);
                    obj.description = $idl.contents();
                }
                else this.msg.pub("error", "Expected typedef, got: " + str);
                return obj;
            },

            processImplements: function (obj, str, $idl) {
                obj.type = "implements";
                var match = /^\s*(.+?)\s+implements\s+(.+)\s*$/.exec(str);
                if (match) {
                    this.setID(obj, match[1]);
                    obj.datatype = match[2];
                    obj.description = $idl.contents();
                }
                else this.msg.pub("error", "Expected implements, got: " + str);
                return obj;
            },

            processMembers:    function (obj, $el) {
                var exParent = this.parent
                ,   self = this;
                this.parent = obj;
                $el.find("> dt").each(function () {
                    var $dt = $(this)
                    ,   $dd = $dt.next()
                    ,   t = obj.type
                    ,   mem
                    ;
                    if      (t === "exception")     mem = self.exceptionMember($dt, $dd);
                    else if (t === "dictionary")    mem = self.dictionaryMember($dt, $dd);
                    else if (t === "callback")      mem = self.callbackMember($dt, $dd);
                    else if (t === "enum")          mem = self.processEnumMember($dt, $dd);
                    else                            mem = self.interfaceMember($dt, $dd);
                    obj.children.push(mem);
                });
                this.parent = exParent;
            },

            parseConst:    function (obj, str) {
                // CONST
                var match = /^\s*const\s+\b([^=]+\??)\s+([^=\s]+)\s*=\s*(.*)$/.exec(str);
                if (match) {
                    obj.type = "constant";
                    var type = match[1];
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[2]);
                    obj.value = match[3];
                    return true;
                }
                return false;
            },

            exceptionMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // CONST
                if (this.parseConst(obj, str)) return obj;

                // FIELD
                var match = /^\s*(.*?)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    obj.type = "field";
                    var type = match[1];
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[2]);
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected exception member, got: " + str);
            },

            dictionaryMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                var match = /^\s*(?:(required)\s+)?([^=]+\??)\s+([^=\s]+)(?:\s*=\s*(.*))?$/.exec(str);
                if (match) {
                    obj.type = "member";
                    obj.declaration = match[1] ? match[1] : "";
                    obj.declaration += (new Array(9-obj.declaration.length)).join(" "); // fill string with spaces
                    var type = match[2];
                    obj.defaultValue = match[4];
                    this.setID(obj, match[3]);
                    this.parseDatatype(obj, type);
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected dictionary member, got: " + str);
            },

            callbackMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                var match = /^\s*(.*?)\s+([A-Za-z][A-Za-z0-9]*)\s*$/.exec(str);
                if (match) {
                    obj.type = "member";
                    var type = match[1];
                    this.setID(obj, match[2]);
                    obj.defaultValue = match[3];
                    this.parseDatatype(obj, type);
                    this.optional(obj);
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected callback member, got: " + str);
            },

            processEnumMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text());
                obj.description = $dd.contents();
                str = this.parseExtendedAttributes(str, obj);

                // MEMBER
                obj.type = "member";
                this.setID(obj, str || "EMPTY");
                obj.refId = sn.sanitiseID(obj.id); // override with different ID type
                return obj;
            },

            interfaceMember:    function ($dt, $dd) {
                var obj = { children: [] }
                ,   str = norm($dt.text())
                ,   $extPrm = $dd.find("dl.parameters").first()
                ,   $sgrs = $dd.find(".getraises, .setraises")
                ,   $excepts = $dd.find("dl.exception").first()
                ;
                obj.description = $dd.contents().not("dl.parameters");
                str = this.parseExtendedAttributes(str, obj);
                var match;

                // ATTRIBUTE
                match = /^\s*(?:(static)\s+)?(?:(readonly|inherit|stringifier)\s+)?attribute\s+(.*?)\s+(\S+)\s*$/.exec(str);
                if (match) {
                    obj.type = "attribute";
                    obj.declaration = match[1] ? match[1] : "";
                    obj.declaration += (obj.declaration ? " " : "") + (match[2] !== undefined ? match[2] : "");
                    obj.declaration += (new Array(16-obj.declaration.length)).join(" "); // fill string with spaces
                    var type = match[3];
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[4]);
                    obj.raises = [];
                    $sgrs.each(function () {
                        var $el = $(this)
                        ,   exc = {
                                id:     $el.attr("title")
                            ,   onSet:  $el.hasClass("setraises")
                            ,   onGet:  $el.hasClass("getraises")
                        };
                        if ($el.is("dl")) {
                            exc.type = "codelist";
                            exc.description = [];
                            $el.find("dt").each(function () {
                                var $dt = $(this)
                                ,   $dd = $dt.next("dd");
                                exc.description.push({ id: $dt.text(), description: $dd.contents().clone() });
                            });
                        }
                        else if ($el.is("div")) {
                            exc.type = "simple";
                            exc.description = $el.contents().clone();
                        }
                        else {
                            this.msg.pub("error", "Do not know what to do with exceptions being raised defined outside of a div or dl.");
                        }
                        $el.remove();
                        obj.raises.push(exc);
                    });

                    return obj;
                }

                // CONST
                if (this.parseConst(obj, str)) return obj;

                // CONSTRUCTOR
                match = /^\s*Constructor(?:\s*\(\s*(.*)\s*\))?\s*$/.exec(str);
                if (match) {
                    obj.type = "constructor";
                    var prm = match[1] ? match[1] : [];
                    this.setID(obj, this.parent.id);
                    obj.named = false;
                    obj.datatype = "";

                    return this.methodMember(obj, $excepts, $extPrm, prm);
                }

                // NAMED CONSTRUCTOR
                match = /^\s*NamedConstructor\s*(?:=\s*)?\b([^(]+)(?:\s*\(\s*(.*)\s*\))?\s*$/.exec(str);
                if (match) {
                    obj.type = "constructor";
                    var prm = match[2] ? match[2] : [];
                    this.setID(obj, match[1]);
                    obj.named = true;
                    obj.datatype = "";

                    return this.methodMember(obj, $excepts, $extPrm, prm);
                }

                // METHOD
                match = /^\s*(.*?)\s+\b(\S+?)\s*\(\s*(.*)\s*\)\s*$/.exec(str);
                if (match) {
                    obj.type = "method";
                    var type = match[1]
                    ,   prm = match[3];
                    // XXX we need to do better for parsing modifiers
                    type = this.parseStatic(obj, type);
                    this.parseDatatype(obj, type);
                    this.setID(obj, match[2]);

                    return this.methodMember(obj, $excepts, $extPrm, prm);
                }

                // SERIALIZER
                match = /^\s*serializer(\s*=\s*((\{\s*(\S+(\s*,\s*\S+)*)?\s*\})|(\[(\s*\S+(\s*,\s*\S+)*)?\s*\])|(\S+)))?\s*$/.exec(str);
                if (match) {
                    obj.type = "serializer";
                    obj.values = [];
                    this.setID(obj, "serializer");
                    var serializermap = match[3],
                    serializerlist = match[6],
                    serializerattribute = match[9], rawvalues;
                    if (serializermap) {
                        obj.serializertype = "map";
                        rawvalues = match[4];
                    }
                    else if (serializerlist) {
                        obj.serializertype = "list";
                        rawvalues = match[7];
                    }
                    else if (serializerattribute) {
                        obj.serializertype = "attribute";
                        obj.values.push(serializerattribute);
                    }
                    else {
                        obj.serializertype = "prose";
                    }
                    if (rawvalues) {
                        // split at comma and remove white space
                        var values = rawvalues.split(/\s*,\s*/);
                        obj.getter = false;
                        obj.inherit = false;
                        obj.all = false;
                        if (values[0] == "getter") {
                            obj.getter = true;
                        }
                        else {
                            if (obj.serializertype == "map") {
                                if (values[0] == "inherit") {
                                    obj.inherit = true;
                                    values.shift();
                                }
                                if (values[0] == "attribute" && obj.serializertype == "map" ) {
                                    obj.all = true;
                                    values = [];
                                }
                            }
                            obj.values = values;
                        }
                    }
                    return obj;
                }

                // ITERABLE
                match = /^\s*iterable\s*<\s*([^,]*)\s*(,\s*(.*)\s*)?>\s*$/.exec(str);
                if (match) {
                    obj.type = "iterable";
                    obj.key = match[1];
                    obj.value = match[3];
                    return obj;
                }

                // MAPLIKE
                match = /^\s*(readonly\s+)?maplike\s*<\s*(.*)\s*,\s*(.*)\s*>\s*$/.exec(str);
                if (match) {
                    obj.type = "maplike";
                    obj.readonly = match[1] !== undefined;
                    obj.key = match[2];
                    obj.value = match[3];
                    return obj;
                }

                // COMMENT
                match = /^\s*\/\/\s*(.*)\s*$/.exec(str);
                if (match) {
                    obj.type = "comment";
                    obj.id = match[1];
                    return obj;
                }

                // NOTHING MATCHED
                this.msg.pub("error", "Expected interface member, got: " + str);
            },

            methodMember:   function (obj, $excepts, $extPrm, prm) {
                obj.params = [];
                obj.raises = [];

                $excepts.each(function () {
                    var $el = $(this)
                    ,   exc = { id: $el.attr("title") };
                    if ($el.is("dl")) {
                        exc.type = "codelist";
                        exc.description = [];
                        $el.find("dt").each(function () {
                            var $dt = $(this)
                            ,   $dd = $dt.next("dd");
                            exc.description.push({ id: $dt.text(), description: $dd.contents().clone() });
                        });
                    }
                    else if ($el.is("div")) {
                        exc.type = "simple";
                        exc.description = $el.contents().clone();
                    }
                    else {
                        this.msg.pub("error", "Do not know what to do with exceptions being raised defined outside of a div or dl.");
                    }
                    $el.remove();
                    obj.raises.push(exc);
                });


                if ($extPrm.length) {
                    $extPrm.remove();
                    var self = this;
                    $extPrm.find("> dt").each(function () {
                        return self.params($(this).text(), $(this).next(), obj);
                    });
                }
                else {
                    while (prm.length) {
                        prm = this.params(prm, null, obj);
                        if (prm === false) break;
                    }
                }

                // apply optional
                var seenOptional = false;
                for (var i = 0; i < obj.params.length; i++) {
                    if (seenOptional) {
                        obj.params[i].optional = true;
                        obj.params[i].datatype = obj.params[i].datatype.replace(/\boptional\s+/, "");
                    }
                    else {
                        seenOptional = this.optional(obj.params[i]);
                    }
                }
                return obj;
            },

            parseDatatype:  function (obj, type) {
                type = this.nullable(obj, type);
                type = this.array(obj, type);
                obj.variadic = false;
                if (/\.\.\./.test(type)) {
                    type = type.replace(/\.\.\./, "");
                    obj.variadic = true;
                }
                if (type.indexOf("(") === 0) {
                    type = type.replace("(", "").replace(")", "");
                    obj.datatype = type.split(/\s+or\s+/);
                    obj.isUnionType = true;
                }
                else {
                    obj.datatype = type;
                }
            },

            parseStatic:  function (obj, type) {
                if (/^static\s+/.test(type)) {
                    type = type.replace(/^static\s+/, "");
                    obj.isStatic = true;
                }
                else {
                    obj.isStatic = false;
                }
                return type;
            },

            parseExtendedAttributes:    function (str, obj) {
                if (!str) return;
                return str.replace(/^\s*\[([^\]]+)\]\s*/, function (x, m1) { obj.extendedAttributes = m1; return ""; });
            },

            makeMarkup:    function (id) {
                var $df = $("<div></div>");
                var attr = { "class": "idl" };
                if (id) attr.id = id;
                var $pre = $("<pre></pre>").attr(attr);
                $pre.html(this.writeAsWebIDL(this.parent, -1));
                $df.append($pre);
                if (!this.conf.noLegacyStyle) $df.append(this.writeAsHTML(this.parent));
                this.mergeWebIDL(this.parent.children[0]);
                return $df.children();
            },

            parseParameterized: function (str) {
                var matched = /^(sequence|Promise|CancelablePromise|EventStream|FrozenArray)<(.+)>$/.exec(str);
                if (!matched)
                    return null;
                return { type: matched[1], parameter: matched[2] };
            },

            writeSerializerAsHTML: function (div, it) {
                if (it.serializertype != "prose") {
                    var generatedDescription = "Instances of this interface are serialized as ";
                    if (it.serializertype == "map") {
                        var mapDescription = "a map ";
                        if (it.getter) {
                            mapDescription += "with entries corresponding to the named properties";
                        }
                        else {
                            var and = "";
                            if (it.inherit) {
                                mapDescription += "with entries from the closest inherited interface ";
                                and = "and ";
                            }
                            if (it.all) {
                                mapDescription += and + "with entries for each of the serializable attributes";
                            }
                            else if (it.values && it.values.length) {
                                mapDescription += and + "with entries for the following attributes: " + it.values.join(", ");
                            }
                            else {
                                mapDescription = "an empty map";
                            }
                        }
                        generatedDescription += mapDescription;
                    }
                    else if (it.serializertype == "list") {
                        var listDescription = "a list ";
                        if (it.getter) {
                            listDescription += "with values corresponding to the indexed properties";
                        }
                        else {
                            if (it.values && it.values.length) {
                                listDescription += "with the values of the following attributes: " + it.values.join(", ");
                            }
                            else {
                                listDescription = "an empty list";
                            }
                        }
                        generatedDescription += listDescription;
                    }
                    else if (it.serializertype == "attribute") {
                        generatedDescription += "the value of the attribute " + it.values[0];
                    }
                    generatedDescription += ".";
                    sn.element("p", {}, div, generatedDescription);
                }
                sn.element("p", {}, div, [it.description]);
            },

            writeIterableAsHTML: function (parent, iterable) {
                var members = '"entries", "keys", "values" and @@iterator methods';

                var p = sn.element("p", {}, parent);
                sn.text("This interface has " + members + " brought by ", p);
                sn.element("code", {}, p, "iterable");
                sn.text(".", p);

                sn.element("p", {}, parent, iterable.description);
            },

            writeMaplikeAsHTML: function (parent, maplike) {
                var readonly = "";
                var members = "";
                if (maplike.readonly) {
                    readonly = "readonly ";
                    members = '"entries", "forEach", "get", "has", "keys", "values", @@iterator methods and a "size" getter';
                } else {
                    members = '"entries", "forEach", "get", "has", "keys", "values", "clear", "delete", "set", @@iterator methods and a "size" getter';
                }

                var p = sn.element("p", {}, parent);
                sn.text("This interface has " + members + " brought by ", p);
                sn.element("code", {}, p, readonly + "maplike");
                sn.text(".", p);

                sn.element("p", {}, parent, maplike.description);
            },

            writeTypeFilteredThingsInInterfaceAsHTML: function (obj, curLnk, parent, type, things) {

                if (type == "iterable") {
                    // We assume iterable is specified at most once in one interface.
                    this.writeIterableAsHTML(parent, things[0]);
                    return;
                }

                if (type == "maplike") {
                    // We assume maplike is specified at most once in one interface.
                    this.writeMaplikeAsHTML(parent, things[0]);
                    return;
                }

                var sec = sn.element("section", {}, parent)
                var secTitle = type.substr(0, 1).toUpperCase() + type.substr(1) + (type != "serializer" ? "s" : "");
                if (!this.conf.noIDLSectionTitle) sn.element("h2", {}, sec, secTitle);
                if (type == "serializer") {
                    this.writeSerializerAsHTML(sn.element("div", {}, sec), things[0]);
                    return;
                }
                var dl = sn.element("dl", { "class": type + "s" }, sec);
                for (var j = 0; j < things.length; j++) {
                    var it = things[j];
                    var id = (type == "method") ? this.makeMethodID(curLnk, it) :
                        (type == "constructor") ? this.makeMethodID("widl-ctor-", it)
                        : sn.idThatDoesNotExist(curLnk + it.refId);
                    var dt = sn.element("dt", { id: id }, dl);
                    sn.element("code", {}, dt, it.unescapedId);
                    if (it.isStatic) dt.append(this.doc.createTextNode(", static"));
                    var desc = sn.element("dd", {}, dl, [it.description]);
                    if (type == "method" || type == "constructor") {
                        if (it.params.length) {
                            var table = sn.element("table", { "class": "parameters" }, desc);
                            var tr = sn.element("tr", {}, table);
                            ["Parameter", "Type", "Nullable", "Optional", "Description"].forEach(function (tit) { sn.element("th", {}, tr, tit); });
                            for (var k = 0; k < it.params.length; k++) {
                                var prm = it.params[k];
                                var tr = sn.element("tr", {}, table);
                                sn.element("td", { "class": "prmName" }, tr, prm.id);
                                var tyTD = sn.element("td", { "class": "prmType" }, tr);
                                var code = sn.element("code", {}, tyTD);
                                var codeHTML = datatype(prm.datatype);
                                if (prm.array) codeHTML += arrsq(prm);
                                if (prm.defaultValue) {
                                    codeHTML += " = " + prm.defaultValue;
                                }
                                code.html(codeHTML);
                                if (prm.nullable) sn.element("td", { "class": "prmNullTrue" }, tr, $("<span role='img' aria-label='True'>\u2714</span>"));
                                else              sn.element("td", { "class": "prmNullFalse" }, tr, $("<span role='img' aria-label='False'>\u2718</span>"));
                                if (prm.optional) sn.element("td", { "class": "prmOptTrue" }, tr,  $("<span role='img' aria-label='True'>\u2714</span>"));
                                else              sn.element("td", { "class": "prmOptFalse" }, tr, $("<span role='img' aria-label='False'>\u2718</span>"));
                                var cnt = prm.description ? [prm.description] : "";
                                sn.element("td", { "class": "prmDesc" }, tr, cnt);
                            }
                        }
                        else {
                            sn.element("div", {}, desc, [sn.element("em", {}, null, "No parameters.")]);
                        }
                        if (this.conf.idlOldStyleExceptions && it.raises.length) {
                            var table = sn.element("table", { "class": "exceptions" }, desc);
                            var tr = sn.element("tr", {}, table);
                            ["Exception", "Description"].forEach(function (tit) { sn.element("th", {}, tr, tit); });
                            for (var k = 0; k < it.raises.length; k++) {
                                var exc = it.raises[k];
                                var tr = sn.element("tr", {}, table);
                                sn.element("td", { "class": "excName" }, tr, [sn.element("a", {}, null, exc.id)]);
                                var dtd = sn.element("td", { "class": "excDesc" }, tr);
                                if (exc.type == "simple") {
                                    dtd.append(exc.description);
                                }
                                else {
                                    var ctab = sn.element("table", { "class": "exceptionCodes" }, dtd );
                                    for (var m = 0; m < exc.description.length; m++) {
                                        var cd = exc.description[m];
                                        var tr = sn.element("tr", {}, ctab);
                                        sn.element("td", { "class": "excCodeName" }, tr, [sn.element("code", {}, null, cd.id)]);
                                        sn.element("td", { "class": "excCodeDesc" }, tr, [cd.description]);
                                    }
                                }
                            }
                        }
                        // else {
                        //     sn.element("div", {}, desc, [sn.element("em", {}, null, "No exceptions.")]);
                        // }

                        if (type !== "constructor") {
                            var reDiv = sn.element("div", {}, desc);
                            sn.element("em", {}, reDiv, "Return type: ");
                            var code = sn.element("code", {}, reDiv);
                            var codeHTML = datatype(it.datatype);
                            if (it.array) codeHTML += arrsq(it);
                            if (it.nullable) sn.text(", nullable", reDiv);
                            code.html(codeHTML);
                        }
                    }
                    else if (type == "attribute") {
                        sn.text(" of type ", dt);
                        if (it.array) {
                            for (var m = 0, n = it.arrayCount; m < n; m++) sn.text("array of ", dt);
                        }
                        var span = sn.element("span", { "class": "idlAttrType" }, dt);
                        var parameterized = this.parseParameterized(it.datatype);
                        if (parameterized) {
                            sn.text(parameterized.type + "<", span);
                            sn.element("a", {}, span, parameterized.parameter);
                            sn.text(">", span);
                        }
                        else {
                            sn.element("a", {}, span, it.isUnionType ? "(" + it.datatype.join(" or ") + ")" : it.datatype);
                        }
                        if (it.declaration.trim()) sn.text(", " + it.declaration, dt);
                        if (it.nullable) sn.text(", nullable", dt);
                         if (this.conf.idlOldStyleExceptions && it.raises.length) {
                            var table = sn.element("table", { "class": "exceptions" }, desc);
                            var tr = sn.element("tr", {}, table);
                            ["Exception", "On Get", "On Set", "Description"].forEach(function (tit) { sn.element("th", {}, tr, tit); });
                            for (var k = 0; k < it.raises.length; k++) {
                                var exc = it.raises[k];
                                var tr = sn.element("tr", {}, table);
                                sn.element("td", { "class": "excName" }, tr, [sn.element("a", {}, null, exc.id)]);
                                ["onGet", "onSet"].forEach(function (gs) {
                                    if (exc[gs]) sn.element("td", { "class": "excGetSetTrue" }, tr, $("<span role='img' aria-label='True'>\u2714</span>"));
                                    else         sn.element("td", { "class": "excGetSetFalse" }, tr, $("<span role='img' aria-label='False'>\u2718</span>"));
                                });
                                var dtd = sn.element("td", { "class": "excDesc" }, tr);
                                if (exc.type == "simple") {
                                    dtd.append(exc.description);
                                }
                                else {
                                    var ctab = sn.element("table", { "class": "exceptionCodes" }, dtd );
                                    for (var m = 0; m < exc.description.length; m++) {
                                        var cd = exc.description[m];
                                        var tr = sn.element("tr", {}, ctab);
                                        sn.element("td", { "class": "excCodeName" }, tr, [sn.element("code", {}, null, cd.id)]);
                                        sn.element("td", { "class": "excCodeDesc" }, tr, [cd.description]);
                                    }
                                }
                            }
                        }
                        // else {
                        //     sn.element("div", {}, desc, [sn.element("em", {}, null, "No exceptions.")]);
                        // }
                    }
                    else if (type == "constant") {
                        sn.text(" of type ", dt);
                        sn.element("span", { "class": "idlConstType" }, dt, [sn.element("a", {}, null, it.datatype)]);
                        if (it.nullable) sn.text(", nullable", dt);
                    }
                }
            },

            writeInterfaceAsHTML: function (obj) {
                var df = sn.documentFragment();
                var curLnk = "widl-" + obj.refId + "-";
                // iterable and maplike are placed first because they don't have their own sections.
                var types = ["iterable", "maplike", "constructor", "attribute", "method", "constant", "serializer"];
                var filterFunc = function (it) { return it.type == type; }
                ,   sortFunc = function (a, b) {
                        if (a.unescapedId < b.unescapedId) return -1;
                        if (a.unescapedId > b.unescapedId) return 1;
                        return 0;
                    }
                ;
                for (var i = 0; i < types.length; i++) {
                    var type = types[i];
                    var things = obj.children.filter(filterFunc);
                    if (things.length === 0) continue;
                    if (!this.noIDLSorting) things.sort(sortFunc);

                    this.writeTypeFilteredThingsInInterfaceAsHTML(obj, curLnk, df, type, things);
                }
                return df;
            },

            writeAsHTML:    function (obj) {
                if (obj.type == "module") {
                    if (obj.id == "outermost") {
                        if (obj.children.length > 1) this.msg.pub("error", "We currently only support one structural level per IDL fragment");
                        return this.writeAsHTML(obj.children[0]);
                    }
                    else {
                        this.msg.pub("warn", "No HTML can be generated for module definitions.");
                        return $("<span></span>");
                    }
                }
                else if (obj.type == "typedef") {
                    var cnt;
                    if (obj.description && obj.description.text()) cnt = [obj.description];
                    else {
                        // yuck -- should use a single model...
                        var $tdt = sn.element("span", { "class": "idlTypedefType" }, null);
                        $tdt.html(datatype(obj.datatype));
                        cnt = [ sn.text("Throughout this specification, the identifier "),
                                sn.element("span", { "class": "idlTypedefID" }, null, obj.unescapedId),
                                sn.text(" is used to refer to the "),
                                sn.text(obj.array ? (obj.arrayCount > 1 ? obj.arrayCount + "-" : "") + "array of " : ""),
                                $tdt,
                                sn.text(obj.nullable ? " (nullable)" : ""),
                                sn.text(" type.")];
                    }
                    return sn.element("div", { "class": "idlTypedefDesc" }, null, cnt);
                }
                else if (obj.type == "implements") {
                    var cnt;
                    if (obj.description && obj.description.text()) cnt = [obj.description];
                    else {
                        cnt = [ sn.text("All instances of the "),
                                sn.element("code", {}, null, [sn.element("a", {}, null, obj.unescapedId)]),
                                sn.text(" type are defined to also implement the "),
                                sn.element("a", {}, null, obj.datatype),
                                sn.text(" interface.")];
                        cnt = [sn.element("p", {}, null, cnt)];
                    }
                    return sn.element("div", { "class": "idlImplementsDesc" }, null, cnt);
                }

                else if (obj.type == "exception") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var types = ["field", "constant"];
                    var filterFunc = function (it) { return it.type === type; }
                    ,   sortFunc = function (a, b) {
                            if (a.unescapedId < b.unescapedId) return -1;
                            if (a.unescapedId > b.unescapedId) return 1;
                            return 0;
                    }
                    ;
                    for (var i = 0; i < types.length; i++) {
                        var type = types[i];
                        var things = obj.children.filter(filterFunc);
                        if (things.length === 0) continue;
                        if (!this.noIDLSorting) {
                            things.sort(sortFunc);
                        }

                        var sec = sn.element("section", {}, df);
                        var secTitle = type;
                        secTitle = secTitle.substr(0, 1).toUpperCase() + secTitle.substr(1) + "s";
                        if (!this.conf.noIDLSectionTitle) sn.element("h2", {}, sec, secTitle);
                        var dl = sn.element("dl", { "class": type + "s" }, sec);
                        for (var j = 0; j < things.length; j++) {
                            var it = things[j];
                            var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                            sn.element("code", {}, dt, it.unescapedId);
                            var desc = sn.element("dd", {}, dl, [it.description]);
                            if (type == "field") {
                                sn.text(" of type ", dt);
                                if (it.array) {
                                    for (var k = 0, n = it.arrayCount; k < n; k++) sn.text("array of ", dt);
                                }
                                var span = sn.element("span", { "class": "idlFieldType" }, dt);
                                var parameterized = this.parseParameterized(it.datatype);
                                if (parameterized) {
                                    sn.text(parameterized.type + "<", span);
                                    sn.element("a", {}, span, parameterized.parameter);
                                    sn.text(">", span);
                                }
                                else {
                                    sn.element("a", {}, span, it.datatype);
                                }
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                            else if (type == "constant") {
                                sn.text(" of type ", dt);
                                sn.element("span", { "class": "idlConstType" }, dt, [sn.element("a", {}, null, it.datatype)]);
                                if (it.nullable) sn.text(", nullable", dt);
                            }
                        }
                    }
                    return df;
                }

                else if (obj.type == "dictionary") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var things = obj.children;
                    var cnt;
                    if (things.length === 0) return df;
                    if (!this.noIDLSorting) {
                        things.sort(function (a, b) {
                            if (a.id < b.id) return -1;
                            if (a.id > b.id) return 1;
                              return 0;
                        });
                    }

                    var sec = sn.element("section", {}, df);
                    cnt = [sn.text("Dictionary "),
                           sn.element("a", { "class": "idlType" }, null, obj.unescapedId),
                           sn.text(" Members")];
                    if (!this.conf.noIDLSectionTitle) sn.element("h2", {}, sec, cnt);
                    var dl = sn.element("dl", { "class": "dictionary-members" }, sec);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                        sn.element("code", {}, dt, it.unescapedId);
                        var desc = sn.element("dd", {}, dl, [it.description]);
                        sn.text(" of type ", dt);
                        if (it.array) {
                            for (var i = 0, n = it.arrayCount; i < n; i++) sn.text("array of ", dt);
                        }
                        var span = sn.element("span", { "class": "idlMemberType" }, dt);
                        var parameterized = this.parseParameterized(it.datatype);
                        if (parameterized) {
                            sn.text(parameterized.type + "<", span);
                            sn.element("a", {}, span, parameterized.parameter);
                            sn.text(">", span);
                        }
                        else {
                            sn.element("a", {}, span, it.isUnionType ? "(" + it.datatype.join(" or ") + ")" : it.datatype);
                        }
                        if (it.declaration.trim()) sn.text(", " + it.declaration, dt);
                        if (it.nullable) sn.text(", nullable", dt);
                        if (it.defaultValue) {
                            sn.text(", defaulting to ", dt);
                            sn.element("code", {}, dt, [sn.text(it.defaultValue)]);
                        }
                    }
                    return df;
                }

                else if (obj.type == "callback") {
                    var df = sn.documentFragment();
                    var curLnk = "widl-" + obj.refId + "-";
                    var things = obj.children;
                    var cnt;
                    if (things.length === 0) return df;

                    var sec = sn.element("section", {}, df);
                    cnt = [sn.text("Callback "),
                           sn.element("a", { "class": "idlType" }, null, obj.unescapedId),
                           sn.text(" Parameters")];
                    if (!this.conf.noIDLSectionTitle) sn.element("h2", {}, sec, cnt);
                    var dl = sn.element("dl", { "class": "callback-members" }, sec);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var dt = sn.element("dt", { id: curLnk + it.refId }, dl);
                        sn.element("code", {}, dt, it.unescapedId);
                        var desc = sn.element("dd", {}, dl, [it.description]);
                        sn.text(" of type ", dt);
                        if (it.array) {
                            for (var i = 0, n = it.arrayCount; i < n; i++) sn.text("array of ", dt);
                        }
                        var span = sn.element("span", { "class": "idlMemberType" }, dt);
                        var parameterized = this.parseParameterized(it.datatype);
                        if (parameterized) {
                            sn.text(parameterized.type + "<", span);
                            sn.element("a", {}, span, parameterized.parameter);
                            sn.text(">", span);
                        }
                        else {
                            sn.element("a", {}, span, it.isUnionType ? "(" + it.datatype.join(" or ") + ")" : it.datatype);
                        }
                        if (it.nullable) sn.text(", nullable", dt);
                        if (it.defaultValue) {
                            sn.text(", defaulting to ", dt);
                            sn.element("code", {}, dt, [sn.text(it.defaultValue)]);
                        }
                    }
                    return df;
                }

                else if (obj.type == "enum") {
                    var df = sn.documentFragment();
                    var things = obj.children;
                    if (things.length === 0) return df;

                    var sec = sn.element("table", { "class": "simple" }, df);
                    sn.element("tr", {}, sec, [sn.element("th", { colspan: 2 }, null, [sn.text("Enumeration description")])]);
                    for (var j = 0; j < things.length; j++) {
                        var it = things[j];
                        var tr = sn.element("tr", {}, sec)
                        ,   td1 = sn.element("td", {}, tr)
                        ;
                        sn.element("code", { "id": "idl-def-" + obj.refId + "." + it.refId }, td1, it.unescapedId);
                        sn.element("td", {}, tr, [it.description]);
                    }
                    return df;
                }

                else if (obj.type == "interface") {
                    return this.writeInterfaceAsHTML(obj);
                }
            },

            makeMethodID:    function (cur, obj) {
                var id = cur + obj.refId + "-" + obj.datatype + "-"
                ,   params = [];
                for (var i = 0, n = obj.params.length; i < n; i++) {
                    var prm = obj.params[i];
                    params.push(prm.datatype + (prm.array ? "Array" : "") + "-" + prm.id);
                }
                id += params.join("-");
                return sn.sanitiseID(id);
            },

            mergeWebIDL:    function (obj) {
                if (typeof obj.merge === "undefined" || obj.merge.length === 0) return;
                // queue for later execution
                setTimeout(function () {
                    for (var i = 0; i < obj.merge.length; i++) {
                        var idlInterface = document.querySelector("#idl-def-" + obj.refId)
                        ,   idlInterfaceToMerge = document.querySelector("#idl-def-" + obj.merge[i]);
                        idlInterface.insertBefore(document.createElement("br"), idlInterface.firstChild);
                        idlInterface.insertBefore(document.createElement("br"), idlInterface.firstChild);
                        idlInterfaceToMerge.parentNode.parentNode.removeChild(idlInterfaceToMerge.parentNode);
                        idlInterface.insertBefore(idlInterfaceToMerge, idlInterface.firstChild);
                    }
                }, 0);
            },

            writeAsWebIDL:    function (obj, indent) {
                indent++;
                var opt = { indent: indent, obj: obj, proc: this };
                if (obj.type === "module") {
                    if (obj.id == "outermost") {
                        var $div = $("<div></div>");
                        for (var i = 0; i < obj.children.length; i++) $div.append(this.writeAsWebIDL(obj.children[i], indent - 1));
                        return $div.children();
                    }
                    else return $(idlModuleTmpl(opt));
                }

                else if (obj.type === "typedef") {
                    opt.nullable = obj.nullable ? "?" : "";
                    opt.arr = arrsq(obj);
                    return $(idlTypedefTmpl(opt));
                }

                else if (obj.type === "implements") {
                    return $(idlImplementsTmpl(opt));
                }

                else if (obj.type === "interface") {
                    // stop gap fix for duplicate IDs while we're transitioning the code
                    var div = this.doc.createElement("div")
                    ,   id = $(div).makeID("idl-def", obj.refId, true)
                    ,   maxAttr = 0, maxMeth = 0, maxConst = 0, hasRO = false;
                    obj.children.forEach(function (it) {
                        var len = 0;
                        if (it.isUnionType)   len = it.datatype.join(" or ").length + 2;
                        else if (it.datatype) len = it.datatype.length;
                        if (it.isStatic) len += 7;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        if (it.type == "attribute") maxAttr = (len > maxAttr) ? len : maxAttr;
                        else if (it.type == "method") maxMeth = (len > maxMeth) ? len : maxMeth;
                        else if (it.type == "constant") maxConst = (len > maxConst) ? len : maxConst;
                        if (it.type == "attribute" && it.declaration) hasRO = true;
                    });
                    var curLnk = "widl-" + obj.refId + "-"
                    ,   self = this
                    ,   ctor = []
                    ,   children = obj.children
                                      .map(function (ch) {
                                          if (ch.type == "attribute") return self.writeAttribute(ch, maxAttr, indent + 1, curLnk, hasRO);
                                          else if (ch.type == "method") return self.writeMethod(ch, maxMeth, indent + 1, curLnk);
                                          else if (ch.type == "constant") return self.writeConst(ch, maxConst, indent + 1, curLnk);
                                          else if (ch.type == "serializer") return self.writeSerializer(ch, indent + 1, curLnk);
                                          else if (ch.type == "constructor") ctor.push(self.writeConstructor(ch, indent, "widl-ctor-"));
                                          else if (ch.type == "iterable") return self.writeIterable(ch, indent + 1, curLnk);
                                          else if (ch.type == "maplike") return self.writeMaplike(ch, indent + 1, curLnk);
                                          else if (ch.type == "comment") return self.writeComment(ch, indent + 1);
                                      })
                                      .join("")
                    ;
                    return idlInterfaceTmpl({
                        obj:        obj
                    ,   indent:     indent
                    ,   id:         id
                    ,   ctor:       ctor.join(",\n")
                    ,   partial:    obj.partial ? "partial " : ""
                    ,   callback:   obj.callback ? "callback " : ""
                    ,   children:   children
                    });
                }

                else if (obj.type === "exception") {
                    var maxAttr = 0, maxConst = 0;
                    obj.children.forEach(function (it) {
                        var len = it.datatype.length;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        if (it.type === "field")   maxAttr = (len > maxAttr) ? len : maxAttr;
                        else if (it.type === "constant") maxConst = (len > maxConst) ? len : maxConst;
                    });
                    var curLnk = "widl-" + obj.refId + "-"
                    ,   self = this
                    ,   children = obj.children
                                      .map(function (ch) {
                                          if (ch.type === "field") return self.writeField(ch, maxAttr, indent + 1, curLnk);
                                          else if (ch.type === "constant") return self.writeConst(ch, maxConst, indent + 1, curLnk);
                                      })
                                      .join("")
                    ;
                    return idlExceptionTmpl({ obj: obj, indent: indent, children: children });
                }

                else if (obj.type === "dictionary") {
                    var max = 0;
                    obj.children.forEach(function (it) {
                        var len = 0;
                        if (it.isUnionType)   len = it.datatype.join(" or ").length + 2;
                        else if (it.datatype) len = it.datatype.length;
                        if (it.nullable) len = len + 1;
                        if (it.array) len = len + (2 * it.arrayCount);
                        max = (len > max) ? len : max;
                    });
                    var curLnk = "widl-" + obj.refId + "-"
                    ,   self = this
                    ,   children = obj.children
                                      .map(function (it) {
                                          return self.writeMember(it, max, indent + 1, curLnk);
                                      })
                                      .join("")
                    ;
                    return idlDictionaryTmpl({ obj: obj, indent: indent, children: children, partial: obj.partial ? "partial " : "" });
                }

                else if (obj.type === "callback") {
                    var params = obj.children
                                    .map(function (it) {
                                        return idlParamTmpl({
                                            obj:        it
                                        ,   optional:   it.optional ? "optional " : ""
                                        ,   arr:        arrsq(it)
                                        ,   nullable:   it.nullable ? "?" : ""
                                        ,   variadic:   it.variadic ? "..." : ""
                                        });
                                    })
                                    .join(", ");
                    return idlCallbackTmpl({
                        obj:        obj
                    ,   indent:     indent
                    ,   arr:        arrsq(obj)
                    ,   nullable:   obj.nullable ? "?" : ""
                    ,   children:   params
                    });
                }

                else if (obj.type === "enum") {
                    var children = obj.children
                                      .map(function (it) { return idlEnumItemTmpl({ obj: it, parentID: obj.refId, indent: indent + 1 }); })
                                      .join(",\n");
                    return idlEnumTmpl({obj: obj, indent: indent, children: children });
                }
            },

            writeField:    function (attr, max, indent, curLnk) {
                var pad = max - attr.datatype.length;
                if (attr.nullable) pad = pad - 1;
                if (attr.array) pad = pad - (2 * attr.arrayCount);
                return idlFieldTmpl({
                    obj:        attr
                ,   indent:     indent
                ,   arr:        arrsq(attr)
                ,   nullable:   attr.nullable ? "?" : ""
                ,   pad:        pad
                ,   href:       curLnk + attr.refId
                });
            },

            writeAttribute:    function (attr, max, indent, curLnk) {
                var len = 0;
                if (attr.isUnionType)   len = attr.datatype.join(" or ").length + 2;
                else if (attr.datatype) len = attr.datatype.length;
                var pad = max - len;
                if (attr.nullable) pad = pad - 1;
                if (attr.array) pad = pad - (2 * attr.arrayCount);
                return idlAttributeTmpl({
                    obj:            attr
                ,   indent:         indent
                ,   declaration:    attr.declaration
                ,   pad:            pad
                ,   arr:            arrsq(attr)
                ,   nullable:       attr.nullable ? "?" : ""
                ,   href:           curLnk + attr.refId
                });
            },

            writeMethod:    function (meth, max, indent, curLnk) {
                var params = meth.params
                                .map(function (it) {
                                    return idlParamTmpl({
                                        obj:        it
                                    ,   optional:   it.optional ? "optional " : ""
                                    ,   arr:        arrsq(it)
                                    ,   nullable:   it.nullable ? "?" : ""
                                    ,   variadic:   it.variadic ? "..." : ""
                                    });
                                })
                                .join(", ");
                var len = 0;
                if (meth.isUnionType) len = meth.datatype.join(" or ").length + 2;
                else                  len = meth.datatype.length;
                if (meth.isStatic) len += 7;
                var pad = max - len;
                if (meth.nullable) pad = pad - 1;
                if (meth.array) pad = pad - (2 * meth.arrayCount);
                return idlMethodTmpl({
                    obj:        meth
                ,   indent:     indent
                ,   arr:        arrsq(meth)
                ,   nullable:   meth.nullable ? "?" : ""
                ,   "static":   meth.isStatic ? "static " : ""
                ,   pad:        pad
                ,   id:         this.makeMethodID(curLnk, meth)
                ,   children:   params
                });
            },

            writeConstructor:   function (ctor, indent, curLnk) {
                var params = ctor.params
                                .map(function (it) {
                                    return idlParamTmpl({
                                        obj:        it
                                    ,   optional:   it.optional ? "optional " : ""
                                    ,   arr:        arrsq(it)
                                    ,   nullable:   it.nullable ? "?" : ""
                                    ,   variadic:   it.variadic ? "..." : ""
                                    });
                                })
                                .join(", ");
                return idlConstructorTmpl({
                    obj:        ctor
                ,   indent:     indent
                ,   id:         this.makeMethodID(curLnk, ctor)
                ,   name:       ctor.named ? ctor.id : "Constructor"
                ,   keyword:    ctor.named ? "NamedConstructor=" : ""
                ,   children:   params
                });
            },

            writeConst:    function (cons, max, indent) {
                var pad = max - cons.datatype.length;
                if (cons.nullable) pad--;
                return idlConstTmpl({ obj: cons, indent: indent, pad: pad, nullable: cons.nullable ? "?" : ""});
            },

            writeComment:   function (comment, indent) {
                return idlCommentTmpl({ obj: comment, indent: indent, comment: comment.id});
            },


            writeSerializer: function (serializer, indent) {
                var values = "";
                if (serializer.serializertype == "map") {
                    var mapValues = [];
                    if (serializer.getter) mapValues = ["getter"];
                    else {
                        if (serializer.inherit) mapValues.push("inherit");
                        if (serializer.all) mapValues.push("attribute");
                        else                mapValues = mapValues.concat(serializer.values);
                    }
                    values = "{" + mapValues.join(", ") + "}";
                }
                else if (serializer.serializertype == "list") {
                    var listValues = (serializer.getter ? ["getter"] : serializer.values);
                    values = "[" + listValues.join(", ") + "]";
                }
                else if (serializer.serializertype == "attribute") {
                    values = serializer.values[0];
                }
                return idlSerializerTmpl({
                    obj:        serializer
                ,   indent:     indent
                ,   values:     values
                });
            },
            
            writeIterable: function (iterable, indent) {
                return idlIterableTmpl({
                    obj:        iterable
                ,   indent:     indent
                });
            },

            writeMaplike: function (maplike, indent) {
                var readonly = maplike.readonly ? "readonly " : "";
                return idlMaplikeTmpl({
                    obj:        maplike
                ,   indent:     indent
                ,   readonly:   readonly
                });
            },

            writeMember:    function (memb, max, indent, curLnk) {
                var opt = { obj: memb, indent: indent, curLnk: curLnk,
                            nullable: (memb.nullable ? "?" : ""), arr: arrsq(memb)};
                if (memb.declaration)   opt.declaration = memb.declaration;
                if (memb.isUnionType)   opt.pad = max - (memb.datatype.join(" or ").length + 2);
                else if (memb.datatype) opt.pad = max - memb.datatype.length;
                if (memb.nullable) opt.pad = opt.pad - 1;
                if (memb.array) opt.pad = opt.pad - (2 * memb.arrayCount);
                return idlDictMemberTmpl(opt);
            }
        };


        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/webidl");
                if (!conf.noIDLSorting) conf.noIDLSorting = false;
                if (!conf.noIDLSectionTitle) conf.noIDLSectionTitle = false;
                sn = new simpleNode(document);
                var $idl = $(".idl", doc).not("pre")
                ,   finish = function () {
                        msg.pub("end", "core/webidl");
                        cb();
                    };
                if (!$idl.length) return finish();
                $(doc).find("head link").first().before($("<style/>").text(css));

                var infNames = [];
                $idl.each(function () {
                    var w = new WebIDLProcessor({ noIDLSorting: conf.noIDLSorting, msg: msg, doc: doc, conf: conf })
                    ,   inf = w.definition($(this))
                    ,   $df = w.makeMarkup(inf.htmlID);
                    $(this).replaceWith($df);
                    if ($.inArray(inf.type, "interface exception dictionary typedef callback enum".split(" ")) !== -1) infNames.push(inf.id);
                });
                doc.normalize();
                $("a:not([href])").each(function () {
                    var $ant = $(this);
                    if ($ant.hasClass("externalDFN")) return;
                    var name = $ant.text();
                    if ($.inArray(name, infNames) !== -1) {
                        $ant.attr("href", "#idl-def-" + name)
                            .addClass("idlType")
                            .html("<code>" + name + "</code>");
                    }
                });
                finish();
            }
        };
    }
);

window.simpleNode = function (doc) {
    this.doc = doc ? doc : document;
};
window.simpleNode.prototype = {

    // --- NODE CREATION ---
    element:    function (name, attr, parent, content) {
        var $el = $(this.doc.createElement(name));
        $el.attr(attr || {});
        if (parent) $(parent).append($el);
        if (content) {
            if (content instanceof jQuery) $el.append(content);
            else if (content instanceof Array) for (var i = 0; i < content.length; i++) $el.append(content[i]);
            else this.text(content, $el);
        }
        return $el;
    },

    text:    function (txt, parent) {
        var tn = this.doc.createTextNode(txt);
        if (parent) $(parent).append(tn);
        return tn;
    },

    documentFragment:    function () {
        return this.doc.createDocumentFragment();
    },

    // --- ID MANAGEMENT ---
    sanitiseID:    function (id) {
        id = id.split(/[^\-.0-9a-zA-Z_]/).join("-");
        id = id.replace(/^-+/g, "");
        id = id.replace(/-+$/, "");
        if (id.length > 0 && /^[^a-z]/.test(id)) id = "x" + id;
        if (id.length === 0) id = "generatedID";
        return id;
    },

    idThatDoesNotExist:    function (id) {
        var inc = 1;
        if (this.doc.getElementById(id)) {
            while (this.doc.getElementById(id + "-" + inc)) inc++;
            id = id + "-" + inc;
        }
        return id;
    }
};

// Module core/contrib
// Fetches names of contributors from github and uses them to fill
// in the content of elements with key identifiers:
// #gh-commenters: people having contributed comments to issues.
// #gh-contributors: people whose PR have been merged.
// Spec editors get filtered out automatically.

define(
    'core/contrib',["github"],
    function (github) {
        return {
            run: function (conf, doc, cb, msg) {
                function theEnd () {
                    msg.pub("end", "core/contrib");
                    cb();
                }
                
                function prop(prop) {
                    return function (o) {
                        return o[prop];
                    };
                }
                
                function slice(args) {
                    return Array.prototype.slice.call(args, 0)
                }

                function findUsers() {
                    var users = {};
                    slice(arguments).forEach(function (things) {
                        things.forEach(function (thing) {
                            if (thing.user) {
                                users[thing.user.url] = true;
                            }
                        });
                    });
                    return Object.keys(users);
                }  

                function join(things) {
                    if (!things.length) {
                        return "";
                    }
                    things = things.slice(0);
                    var last = things.pop();
                    var length = things.length;
                    if (length === 0) {
                        return last;
                    }
                    if (length === 1) {
                        return things[0] + " and " + last;
                    }
                    return things.join(", ") + ", and " + last;
                }

                function toHTML(urls, editors, element) {
                    return $.when.apply($, urls.map(function (url) {
                        return github.fetch(url);
                    })).then(function () {
                        var names = slice(arguments).map(function (user) {
                            user = user[0];
                            return user.name || user.login;
                        }).filter(function (name) {
                            return editors.indexOf(name) < 0;
                        });
                        names.sort(function (a, b) {
                            return a.toLowerCase().localeCompare(b.toLowerCase());
                        });
                        $(element).html(join(names)).attr("id", null);
                    });
                }

                msg.pub("start", "core/contrib");
                var $commenters = doc.querySelector("#gh-commenters");
                var $contributors = doc.querySelector("#gh-contributors");

                if (!$commenters && !$contributors) {
                    theEnd();
                    return;
                }

                if (!conf.githubAPI) {
                    var elements = [];
                    if ($commenters) elements.push("#" + $commenters.id); 
                    if ($contributors) elements.push("#" + $contributors.id);
                    msg.pub("error", "Requested list of contributors and/or commenters from GitHub (" + elements.join(" and ") + ") but config.githubAPI is not set.");
                    theEnd();
                    return;
                }

                github.fetch(conf.githubAPI).then(function (json) {
                    return $.when(
                        github.fetchIndex(json.issues_url),
                        github.fetchIndex(json.issue_comment_url),
                        github.fetchIndex(json.contributors_url)
                    );
                }).then(function(issues, comments, contributors) {
                    var editors = respecConfig.editors.map(prop("name"));
                    var commenters = findUsers(issues, comments);
                    contributors = contributors.map(prop("url"));
                    return $.when(
                        toHTML(commenters, editors, $commenters),
                        toHTML(contributors, editors, $contributors)
                    );
                }).then(theEnd, function(error) {
                    msg.pub("error", "Error loading contributors and/or commenters from GitHub. Error: " + error);
                    theEnd();
                });
            }
        };
    }
);


define('text!core/css/regpict.css',[],function () { return '/* --- REGPICT --- */\ntext.regBitNumMiddle {\n    text-anchor: middle;\n    fill: grey;\n    font-family: "Source Sans Pro", Calibri, Tahoma, "Lucinda Grande", Arial, Helvetica, sans-serif;\n    font-size: 8pt;\n}\n\ntext.regBitNumEnd {\n    text-anchor: end;\n    fill: grey;\n    font-family: "Source Sans Pro", Calibri, Tahoma, "Lucinda Grande", Arial, Helvetica, sans-serif;\n    font-size: 8pt;\n}\n\ntext.regBitNumStart {\n    text-anchor: start;\n    fill: grey;\n    font-family: "Source Sans Pro", Calibri, Tahoma, "Lucinda Grande", Arial, Helvetica, sans-serif;\n    font-size: 8pt;\n}\n\ntext.regBitWidth {\n    text-anchor: middle;\n    fill: none;\n    font-family: "Source Sans Pro", Calibri, Tahoma, "Lucinda Grande", Arial, Helvetica, sans-serif;\n    font-weight: bold;\n    font-size: 11pt;\n}\n\ng line.regBitNumLine {\n\tstroke: grey;\n\tstroke-width: 1px;\n}\n\ng line.regBitNumLine_Hide {\n    stroke: none;\n    stroke-width: 1px;\n}\n\ng rect.regFieldBox {\n\tfill: white;\n\tstroke: black;\n\tstroke-width: 1.5px;\n}\n\ng.regAttr_rsvd rect.regFieldBox,\ng.regAttr_rsvdp rect.regFieldBox,\ng.regAttr_rsvdz rect.regFieldBox,\ng.regAttr_reserved rect.regFieldBox,\ng.regAttr_unused rect.regFieldBox {\n\tfill: white;\n}\n\ng.regFieldExternal line.regFieldBox,\ng.regFieldInternal line.regFieldBox {\n\tstroke: black;\n}\n\ng.regFieldUnused line.regFieldBox {\n\tstroke: grey;\n}\n\ng.regFieldUnused text.regFieldName,\ng.regFieldUnused text.regFieldValue {\n\tfill: grey;\n}\n\ng.regFieldHidden text.regFieldName,\ng.regFieldHidden text.regFieldValue,\ng.regFieldHidden path.regBitLine,\ng.regFieldHidden path.regBitBracket,\ng.regFieldHidden line.regFieldBox,\ng.regFieldHidden rect.regFieldBox,\ng.regFieldHidden line.regBitNumLine,\ng.regFieldHidden line.regBitNumLine_Hide,\ng.regFieldHidden text.regBitNumStart,\ng.regFieldHidden text.regBitNumMiddle,\ng.regFieldHidden text.regBitNumEnd,\ng.regFieldHidden text.regFieldExtendsLeft,\ng.regFieldHidden text.regFieldExtendsRight {\n    fill: none;\n    stroke: none;\n}\n\ng text.regFieldValue,\ng.regFieldInternal text.regFieldName {\n    text-anchor: middle;\n}\n\ng.regFieldOverflowLSB text.regBitNumEnd,\ng text.regFieldExtendsRight {\n    text-anchor: start;\n}\n\ng.regFieldOverflowMSB text.regBitNumStart,\ng text.regFieldExtendsLeft {\n    text-anchor: end;\n}\n\ng text.regFieldName,\ng text.regFieldValue {\n\tfont-size: 11pt;\n\tfont-family: "Source Sans Pro", Calibri, Tahoma, "Lucinda Grande", Arial, Helvetica, sans-serif;\n}\n\ng.regFieldExternal1 path.regBitLine,\ng.regFieldExternal1 path.regBitBracket {\n\tstroke: black;\n\tstroke-width: 1px;\n}\n\ng.regFieldExternal0 path.regBitLine {\n\tstroke: green;\n    stroke-dasharray: 4,2;\n\tstroke-width: 1px;\n}\n\ng.regFieldExternal0 path.regBitBracket {\n    stroke: green;\n    stroke-width: 1px;\n}\n\nsvg text.regFieldValue {\n    fill: #0060A9;\n    font-family: monospace;\n}\n\nsvg.regpict {\n\tcolor: green;\n}\n\nsvg *.svg_error text:not(.regBitWidth),\nsvg *.svg_error text:not(.regBitNumMiddle),\nsvg *.svg_error text:not(.regBitNumEnd),\nsvg *.svg_error text:not(.regBitNumStart) {\n    fill: red;\n    font-size: 12pt;\n    font-weight: bold;\n    font-style: normal;\n    font-family: monospace;\n}\n\nfigure div.json,\nfigure pre.json {\n    color: rgb(0,90,156);\n    display: inherit;\n}\n\n@media screen {\n    g.regLink:hover rect.regFieldBox,\n    g.regLink:focus rect.regFieldBox {\n        fill: #ffa; stroke: blue;\n    }\n    \n    g.regLink:hover line.regBitNumLine,\n    g.regLink:focus line.regBitNumLine,\n    g.regLink:hover line.regBitNumLine_Hide,\n    g.regLink:focus line.regBitNumLine_Hide,\n    g.regLink:hover line.regFieldBox,\n    g.regLink:focus line.regFieldBox,\n    g.regLink:hover path.regBitLine,\n    g.regLink:focus path.regBitLine,\n    g.regLink.regFieldExternal:hover path.regBitBracket,\n    g.regLink.regFieldExternal:focus path.regBitBracket {\n        stroke: blue;\n    }\n\n    g.regLink:hover text.regFieldName,\n    g.regLink:focus text.regFieldName,\n    g.regLink.regFieldExternal:hover text.regFieldValue,\n    g.regLink.regFieldExternal:focus text.regFieldValue {\n        fill: blue; font-weight: bold;\n    }\n\n    g.regLink:hover text.regBitNumMiddle,\n    g.regLink:focus text.regBitNumMiddle,\n    g.regLink:hover text.regBitNumStart,\n    g.regLink:focus text.regBitNumStart,\n    g.regLink:hover text.regBitNumEnd,\n    g.regLink:focus text.regBitNumEnd {\n        fill: blue; font-weight: bold; font-size: 9pt;\n    }\n\n    g.regLink:hover text.regBitWidth,\n    g.regLink:focus text.regBitWidth {\n        fill: blue;\n    }\n}';});

/* http://keith-wood.name/svg.html
   SVG for jQuery v1.4.5.
   Written by Keith Wood (kbwood{at}iinet.com.au) August 2007.
   Dual licensed under the GPL (http://dev.jquery.com/browser/trunk/jquery/GPL-LICENSE.txt) and 
   MIT (http://dev.jquery.com/browser/trunk/jquery/MIT-LICENSE.txt) licenses. 
   Please attribute the author if you use it. */

(function($) { // Hide scope, no $ conflict

/* SVG manager.
   Use the singleton instance of this class, $.svg, 
   to interact with the SVG functionality. */
function SVGManager() {
	this._settings = []; // Settings to be remembered per SVG object
	this._extensions = []; // List of SVG extensions added to SVGWrapper
		// for each entry [0] is extension name, [1] is extension class (function)
		// the function takes one parameter - the SVGWrapper instance
	this.regional = []; // Localisations, indexed by language, '' for default (English)
	this.regional[''] = {errorLoadingText: 'Error loading',
		notSupportedText: 'This browser does not support SVG'};
	this.local = this.regional['']; // Current localisation
	this._uuid = new Date().getTime();
	this._renesis = detectActiveX('RenesisX.RenesisCtrl');
}

/* Determine whether a given ActiveX control is available.
   @param  classId  (string) the ID for the ActiveX control
   @return  (boolean) true if found, false if not */
function detectActiveX(classId) {
	try {
		return !!(window.ActiveXObject && new ActiveXObject(classId));
	}
	catch (e) {
		return false;
	}
}

var PROP_NAME = 'svgwrapper';

$.extend(SVGManager.prototype, {
	/* Class name added to elements to indicate already configured with SVG. */
	markerClassName: 'hasSVG',

	/* SVG namespace. */
	svgNS: 'http://www.w3.org/2000/svg',
	/* XLink namespace. */
	xlinkNS: 'http://www.w3.org/1999/xlink',

	/* SVG wrapper class. */
	_wrapperClass: SVGWrapper,

	/* Camel-case versions of attribute names containing dashes or are reserved words. */
	_attrNames: {class_: 'class', in_: 'in',
		alignmentBaseline: 'alignment-baseline', baselineShift: 'baseline-shift',
		clipPath: 'clip-path', clipRule: 'clip-rule',
		colorInterpolation: 'color-interpolation',
		colorInterpolationFilters: 'color-interpolation-filters',
		colorRendering: 'color-rendering', dominantBaseline: 'dominant-baseline',
		enableBackground: 'enable-background', fillOpacity: 'fill-opacity',
		fillRule: 'fill-rule', floodColor: 'flood-color',
		floodOpacity: 'flood-opacity', fontFamily: 'font-family',
		fontSize: 'font-size', fontSizeAdjust: 'font-size-adjust',
		fontStretch: 'font-stretch', fontStyle: 'font-style',
		fontVariant: 'font-variant', fontWeight: 'font-weight',
		glyphOrientationHorizontal: 'glyph-orientation-horizontal',
		glyphOrientationVertical: 'glyph-orientation-vertical',
		horizAdvX: 'horiz-adv-x', horizOriginX: 'horiz-origin-x',
		imageRendering: 'image-rendering', letterSpacing: 'letter-spacing',
		lightingColor: 'lighting-color', markerEnd: 'marker-end',
		markerMid: 'marker-mid', markerStart: 'marker-start',
		stopColor: 'stop-color', stopOpacity: 'stop-opacity',
		strikethroughPosition: 'strikethrough-position',
		strikethroughThickness: 'strikethrough-thickness',
		strokeDashArray: 'stroke-dasharray', strokeDashOffset: 'stroke-dashoffset',
		strokeLineCap: 'stroke-linecap', strokeLineJoin: 'stroke-linejoin',
		strokeMiterLimit: 'stroke-miterlimit', strokeOpacity: 'stroke-opacity',
		strokeWidth: 'stroke-width', textAnchor: 'text-anchor',
		textDecoration: 'text-decoration', textRendering: 'text-rendering',
		underlinePosition: 'underline-position', underlineThickness: 'underline-thickness',
		vertAdvY: 'vert-adv-y', vertOriginY: 'vert-origin-y',
		wordSpacing: 'word-spacing', writingMode: 'writing-mode'},

	/* Add the SVG object to its container. */
	_attachSVG: function(container, settings) {
		var svg = (container.namespaceURI == this.svgNS ? container : null);
		var container = (svg ? null : container);
		if ($(container || svg).hasClass(this.markerClassName)) {
			return;
		}
		if (typeof settings == 'string') {
			settings = {loadURL: settings};
		}
		else if (typeof settings == 'function') {
			settings = {onLoad: settings};
		}
		$(container || svg).addClass(this.markerClassName);
		try {
			if (!svg) {
				svg = document.createElementNS(this.svgNS, 'svg');
				svg.setAttribute('version', '1.1');
				if (container.clientWidth > 0) {
					svg.setAttribute('width', container.clientWidth);
				}
				if (container.clientHeight > 0) {
					svg.setAttribute('height', container.clientHeight);
				}
				container.appendChild(svg);
			}
			this._afterLoad(container, svg, settings || {});
		}
		catch (e) {
			if ($.browser.msie) {
				if (!container.id) {
					container.id = 'svg' + (this._uuid++);
				}
				this._settings[container.id] = settings;
				container.innerHTML = '<embed type="image/svg+xml" width="100%" ' +
					'height="100%" src="' + (settings.initPath || '') + 'blank.svg" ' +
					'pluginspage="http://www.adobe.com/svg/viewer/install/main.html"/>';
			}
			else {
				container.innerHTML = '<p class="svg_error">' +
					this.local.notSupportedText + '</p>';
			}
		}
	},

	/* SVG callback after loading - register SVG root. */
	_registerSVG: function() {
		for (var i = 0; i < document.embeds.length; i++) { // Check all
			var container = document.embeds[i].parentNode;
			if (!$(container).hasClass($.svg.markerClassName) || // Not SVG
					$.data(container, PROP_NAME)) { // Already done
				continue;
			}
			var svg = null;
			try {
				svg = document.embeds[i].getSVGDocument();
			}
			catch(e) {
				setTimeout($.svg._registerSVG, 250); // Renesis takes longer to load
				return;
			}
			svg = (svg ? svg.documentElement : null);
			if (svg) {
				$.svg._afterLoad(container, svg);
			}
		}
	},

	/* Post-processing once loaded. */
	_afterLoad: function(container, svg, settings) {
		var settings = settings || this._settings[container.id];
		this._settings[container ? container.id : ''] = null;
		var wrapper = new this._wrapperClass(svg, container);
		$.data(container || svg, PROP_NAME, wrapper);
		try {
			if (settings.loadURL) { // Load URL
				wrapper.load(settings.loadURL, settings);
			}
			if (settings.settings) { // Additional settings
				wrapper.configure(settings.settings);
			}
			if (settings.onLoad && !settings.loadURL) { // Onload callback
				settings.onLoad.apply(container || svg, [wrapper]);
			}
		}
		catch (e) {
			alert(e);
		}
	},

	/* Return the SVG wrapper created for a given container.
	   @param  container  (string) selector for the container or
	                      (element) the container for the SVG object or
	                      jQuery collection - first entry is the container
	   @return  (SVGWrapper) the corresponding SVG wrapper element, or null if not attached */
	_getSVG: function(container) {
		container = (typeof container == 'string' ? $(container)[0] :
			(container.jquery ? container[0] : container));
		return $.data(container, PROP_NAME);
	},

	/* Remove the SVG functionality from a div.
	   @param  container  (element) the container for the SVG object */
	_destroySVG: function(container) {
		var $container = $(container);
		if (!$container.hasClass(this.markerClassName)) {
			return;
		}
		$container.removeClass(this.markerClassName);
		if (container.namespaceURI != this.svgNS) {
			$container.empty();
		}
		$.removeData(container, PROP_NAME);
	},

	/* Extend the SVGWrapper object with an embedded class.
	   The constructor function must take a single parameter that is
	   a reference to the owning SVG root object. This allows the 
	   extension to access the basic SVG functionality.
	   @param  name      (string) the name of the SVGWrapper attribute to access the new class
	   @param  extClass  (function) the extension class constructor */
	addExtension: function(name, extClass) {
		this._extensions.push([name, extClass]);
	},

	/* Does this node belong to SVG?
	   @param  node  (element) the node to be tested
	   @return  (boolean) true if an SVG node, false if not */
	isSVGElem: function(node) {
		return (node.nodeType == 1 && node.namespaceURI == $.svg.svgNS);
	}
});

/* The main SVG interface, which encapsulates the SVG element.
   Obtain a reference from $().svg('get') */
function SVGWrapper(svg, container) {
	this._svg = svg; // The SVG root node
	this._container = container; // The containing div
	for (var i = 0; i < $.svg._extensions.length; i++) {
		var extension = $.svg._extensions[i];
		this[extension[0]] = new extension[1](this);
	}
}

$.extend(SVGWrapper.prototype, {

	/* Retrieve the width of the SVG object. */
	_width: function() {
		return (this._container ? this._container.clientWidth : this._svg.width);
	},

	/* Retrieve the height of the SVG object. */
	_height: function() {
		return (this._container ? this._container.clientHeight : this._svg.height);
	},

	/* Retrieve the root SVG element.
	   @return  the top-level SVG element */
	root: function() {
		return this._svg;
	},

	/* Configure a SVG node.
	   @param  node      (element, optional) the node to configure
	   @param  settings  (object) additional settings for the root
	   @param  clear     (boolean) true to remove existing attributes first,
	                     false to add to what is already there (optional)
	   @return  (SVGWrapper) this root */
	configure: function(node, settings, clear) {
		if (!node.nodeName) {
			clear = settings;
			settings = node;
			node = this._svg;
		}
		if (clear) {
			for (var i = node.attributes.length - 1; i >= 0; i--) {
				var attr = node.attributes.item(i);
				if (!(attr.nodeName == 'onload' || attr.nodeName == 'version' || 
						attr.nodeName.substring(0, 5) == 'xmlns')) {
					node.attributes.removeNamedItem(attr.nodeName);
				}
			}
		}
		for (var attrName in settings) {
			node.setAttribute($.svg._attrNames[attrName] || attrName, settings[attrName]);
		}
		return this;
	},

	/* Locate a specific element in the SVG document.
	   @param  id  (string) the element's identifier
	   @return  (element) the element reference, or null if not found */
	getElementById: function(id) {
		return this._svg.ownerDocument.getElementById(id);
	},

	/* Change the attributes for a SVG node.
	   @param  element   (SVG element) the node to change
	   @param  settings  (object) the new settings
	   @return  (SVGWrapper) this root */
	change: function(element, settings) {
		if (element) {
			for (var name in settings) {
				if (settings[name] == null) {
					element.removeAttribute($.svg._attrNames[name] || name);
				}
				else {
					element.setAttribute($.svg._attrNames[name] || name, settings[name]);
				}
			}
		}
		return this;
	},

	/* Check for parent being absent and adjust arguments accordingly. */
	_args: function(values, names, optSettings) {
		names.splice(0, 0, 'parent');
		names.splice(names.length, 0, 'settings');
		var args = {};
		var offset = 0;
		if (values[0] != null && values[0].jquery) {
			values[0] = values[0][0];
		}
		if (values[0] != null && !(typeof values[0] == 'object' && values[0].nodeName)) {
			args['parent'] = null;
			offset = 1;
		}
		for (var i = 0; i < values.length; i++) {
			args[names[i + offset]] = values[i];
		}
		if (optSettings) {
			$.each(optSettings, function(i, value) {
				if (typeof args[value] == 'object') {
					args.settings = args[value];
					args[value] = null;
				}
			});
		}
		return args;
	},

	/* Add a title.
	   @param  parent    (element or jQuery) the parent node for the new title (optional)
	   @param  text      (string) the text of the title
	   @param  settings  (object) additional settings for the title (optional)
	   @return  (element) the new title node */
	title: function(parent, text, settings) {
		var args = this._args(arguments, ['text']);
		var node = this._makeNode(args.parent, 'title', args.settings || {});
		node.appendChild(this._svg.ownerDocument.createTextNode(args.text));
		return node;
	},

	/* Add a description.
	   @param  parent    (element or jQuery) the parent node for the new description (optional)
	   @param  text      (string) the text of the description
	   @param  settings  (object) additional settings for the description (optional)
	   @return  (element) the new description node */
	describe: function(parent, text, settings) {
		var args = this._args(arguments, ['text']);
		var node = this._makeNode(args.parent, 'desc', args.settings || {});
		node.appendChild(this._svg.ownerDocument.createTextNode(args.text));
		return node;
	},

	/* Add a definitions node.
	   @param  parent    (element or jQuery) the parent node for the new definitions (optional)
	   @param  id        (string) the ID of this definitions (optional)
	   @param  settings  (object) additional settings for the definitions (optional)
	   @return  (element) the new definitions node */
	defs: function(parent, id, settings) {
		var args = this._args(arguments, ['id'], ['id']);
		return this._makeNode(args.parent, 'defs', $.extend(
			(args.id ? {id: args.id} : {}), args.settings || {}));
	},

	/* Add a symbol definition.
	   @param  parent    (element or jQuery) the parent node for the new symbol (optional)
	   @param  id        (string) the ID of this symbol
	   @param  x1        (number) the left coordinate for this symbol
	   @param  y1        (number) the top coordinate for this symbol
	   @param  width     (number) the width of this symbol
	   @param  height    (number) the height of this symbol
	   @param  settings  (object) additional settings for the symbol (optional)
	   @return  (element) the new symbol node */
	symbol: function(parent, id, x1, y1, width, height, settings) {
		var args = this._args(arguments, ['id', 'x1', 'y1', 'width', 'height']);
		return this._makeNode(args.parent, 'symbol', $.extend({id: args.id,
			viewBox: args.x1 + ' ' + args.y1 + ' ' + args.width + ' ' + args.height},
			args.settings || {}));
	},

	/* Add a marker definition.
	   @param  parent    (element or jQuery) the parent node for the new marker (optional)
	   @param  id        (string) the ID of this marker
	   @param  refX      (number) the x-coordinate for the reference point
	   @param  refY      (number) the y-coordinate for the reference point
	   @param  mWidth    (number) the marker viewport width
	   @param  mHeight   (number) the marker viewport height
	   @param  orient    (string or int) 'auto' or angle (degrees) (optional)
	   @param  settings  (object) additional settings for the marker (optional)
	   @return  (element) the new marker node */
	marker: function(parent, id, refX, refY, mWidth, mHeight, orient, settings) {
		var args = this._args(arguments, ['id', 'refX', 'refY',
			'mWidth', 'mHeight', 'orient'], ['orient']);
		return this._makeNode(args.parent, 'marker', $.extend(
			{id: args.id, refX: args.refX, refY: args.refY, markerWidth: args.mWidth, 
			markerHeight: args.mHeight, orient: args.orient || 'auto'}, args.settings || {}));
	},

	/* Add a style node.
	   @param  parent    (element or jQuery) the parent node for the new node (optional)
	   @param  styles    (string) the CSS styles
	   @param  settings  (object) additional settings for the node (optional)
	   @return  (element) the new style node */
	style: function(parent, styles, settings) {
		var args = this._args(arguments, ['styles']);
		var node = this._makeNode(args.parent, 'style', $.extend(
			{type: 'text/css'}, args.settings || {}));
		node.appendChild(this._svg.ownerDocument.createTextNode(args.styles));
		if ($.browser.opera) {
			$('head').append('<style type="text/css">' + args.styles + '</style>');
		}
		return node;
	},

	/* Add a script node.
	   @param  parent    (element or jQuery) the parent node for the new node (optional)
	   @param  script    (string) the JavaScript code
	   @param  type      (string) the MIME type for the code (optional, default 'text/javascript')
	   @param  settings  (object) additional settings for the node (optional)
	   @return  (element) the new script node */
	script: function(parent, script, type, settings) {
		var args = this._args(arguments, ['script', 'type'], ['type']);
		var node = this._makeNode(args.parent, 'script', $.extend(
			{type: args.type || 'text/javascript'}, args.settings || {}));
		node.appendChild(this._svg.ownerDocument.createTextNode(args.script));
		if (!$.browser.mozilla) {
			$.globalEval(args.script);
		}
		return node;
	},

	/* Add a linear gradient definition.
	   Specify all of x1, y1, x2, y2 or none of them.
	   @param  parent    (element or jQuery) the parent node for the new gradient (optional)
	   @param  id        (string) the ID for this gradient
	   @param  stops     (string[][]) the gradient stops, each entry is
	                     [0] is offset (0.0-1.0 or 0%-100%), [1] is colour, 
						 [2] is opacity (optional)
	   @param  x1        (number) the x-coordinate of the gradient start (optional)
	   @param  y1        (number) the y-coordinate of the gradient start (optional)
	   @param  x2        (number) the x-coordinate of the gradient end (optional)
	   @param  y2        (number) the y-coordinate of the gradient end (optional)
	   @param  settings  (object) additional settings for the gradient (optional)
	   @return  (element) the new gradient node */
	linearGradient: function(parent, id, stops, x1, y1, x2, y2, settings) {
		var args = this._args(arguments,
			['id', 'stops', 'x1', 'y1', 'x2', 'y2'], ['x1']);
		var sets = $.extend({id: args.id}, 
			(args.x1 != null ? {x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2} : {}));
		return this._gradient(args.parent, 'linearGradient', 
			$.extend(sets, args.settings || {}), args.stops);
	},

	/* Add a radial gradient definition.
	   Specify all of cx, cy, r, fx, fy or none of them.
	   @param  parent    (element or jQuery) the parent node for the new gradient (optional)
	   @param  id        (string) the ID for this gradient
	   @param  stops     (string[][]) the gradient stops, each entry
	                     [0] is offset, [1] is colour, [2] is opacity (optional)
	   @param  cx        (number) the x-coordinate of the largest circle centre (optional)
	   @param  cy        (number) the y-coordinate of the largest circle centre (optional)
	   @param  r         (number) the radius of the largest circle (optional)
	   @param  fx        (number) the x-coordinate of the gradient focus (optional)
	   @param  fy        (number) the y-coordinate of the gradient focus (optional)
	   @param  settings  (object) additional settings for the gradient (optional)
	   @return  (element) the new gradient node */
	radialGradient: function(parent, id, stops, cx, cy, r, fx, fy, settings) {
		var args = this._args(arguments,
			['id', 'stops', 'cx', 'cy', 'r', 'fx', 'fy'], ['cx']);
		var sets = $.extend({id: args.id}, (args.cx != null ?
			{cx: args.cx, cy: args.cy, r: args.r, fx: args.fx, fy: args.fy} : {}));
		return this._gradient(args.parent, 'radialGradient', 
			$.extend(sets, args.settings || {}), args.stops);
	},

	/* Add a gradient node. */
	_gradient: function(parent, name, settings, stops) {
		var node = this._makeNode(parent, name, settings);
		for (var i = 0; i < stops.length; i++) {
			var stop = stops[i];
			this._makeNode(node, 'stop', $.extend(
				{offset: stop[0], stopColor: stop[1]}, 
				(stop[2] != null ? {stopOpacity: stop[2]} : {})));
		}
		return node;
	},

	/* Add a pattern definition.
	   Specify all of vx, vy, xwidth, vheight or none of them.
	   @param  parent    (element or jQuery) the parent node for the new pattern (optional)
	   @param  id        (string) the ID for this pattern
	   @param  x         (number) the x-coordinate for the left edge of the pattern
	   @param  y         (number) the y-coordinate for the top edge of the pattern
	   @param  width     (number) the width of the pattern
	   @param  height    (number) the height of the pattern
	   @param  vx        (number) the minimum x-coordinate for view box (optional)
	   @param  vy        (number) the minimum y-coordinate for the view box (optional)
	   @param  vwidth    (number) the width of the view box (optional)
	   @param  vheight   (number) the height of the view box (optional)
	   @param  settings  (object) additional settings for the pattern (optional)
	   @return  (element) the new pattern node */
	pattern: function(parent, id, x, y, width, height, vx, vy, vwidth, vheight, settings) {
		var args = this._args(arguments, ['id', 'x', 'y', 'width', 'height',
			'vx', 'vy', 'vwidth', 'vheight'], ['vx']);
		var sets = $.extend({id: args.id, x: args.x, y: args.y,
			width: args.width, height: args.height}, (args.vx != null ?
			{viewBox: args.vx + ' ' + args.vy + ' ' + args.vwidth + ' ' + args.vheight} : {}));
		return this._makeNode(args.parent, 'pattern', $.extend(sets, args.settings || {}));
	},

	/* Add a clip path definition.
	   @param  parent  (element) the parent node for the new element (optional)
	   @param  id      (string) the ID for this path
	   @param  units   (string) either 'userSpaceOnUse' (default) or 'objectBoundingBox' (optional)
	   @return  (element) the new clipPath node */
	clipPath: function(parent, id, units, settings) {
		var args = this._args(arguments, ['id', 'units']);
		args.units = args.units || 'userSpaceOnUse';
		return this._makeNode(args.parent, 'clipPath', $.extend(
			{id: args.id, clipPathUnits: args.units}, args.settings || {}));
	},

	/* Add a mask definition.
	   @param  parent    (element or jQuery) the parent node for the new mask (optional)
	   @param  id        (string) the ID for this mask
	   @param  x         (number) the x-coordinate for the left edge of the mask
	   @param  y         (number) the y-coordinate for the top edge of the mask
	   @param  width     (number) the width of the mask
	   @param  height    (number) the height of the mask
	   @param  settings  (object) additional settings for the mask (optional)
	   @return  (element) the new mask node */
	mask: function(parent, id, x, y, width, height, settings) {
		var args = this._args(arguments, ['id', 'x', 'y', 'width', 'height']);
		return this._makeNode(args.parent, 'mask', $.extend(
			{id: args.id, x: args.x, y: args.y, width: args.width, height: args.height},
			args.settings || {}));
	},

	/* Create a new path object.
	   @return  (SVGPath) a new path object */
	createPath: function() {
		return new SVGPath();
	},

	/* Create a new text object.
	   @return  (SVGText) a new text object */
	createText: function() {
		return new SVGText();
	},

	/* Add an embedded SVG element.
	   Specify all of vx, vy, vwidth, vheight or none of them.
	   @param  parent    (element or jQuery) the parent node for the new node (optional)
	   @param  x         (number) the x-coordinate for the left edge of the node
	   @param  y         (number) the y-coordinate for the top edge of the node
	   @param  width     (number) the width of the node
	   @param  height    (number) the height of the node
	   @param  vx        (number) the minimum x-coordinate for view box (optional)
	   @param  vy        (number) the minimum y-coordinate for the view box (optional)
	   @param  vwidth    (number) the width of the view box (optional)
	   @param  vheight   (number) the height of the view box (optional)
	   @param  settings  (object) additional settings for the node (optional)
	   @return  (element) the new node */
	svg: function(parent, x, y, width, height, vx, vy, vwidth, vheight, settings) {
		var args = this._args(arguments, ['x', 'y', 'width', 'height',
			'vx', 'vy', 'vwidth', 'vheight'], ['vx']);
		var sets = $.extend({x: args.x, y: args.y, width: args.width, height: args.height}, 
			(args.vx != null ? {viewBox: args.vx + ' ' + args.vy + ' ' +
			args.vwidth + ' ' + args.vheight} : {}));
		return this._makeNode(args.parent, 'svg', $.extend(sets, args.settings || {}));
	},

	/* Create a group.
	   @param  parent    (element or jQuery) the parent node for the new group (optional)
	   @param  id        (string) the ID of this group (optional)
	   @param  settings  (object) additional settings for the group (optional)
	   @return  (element) the new group node */
	group: function(parent, id, settings) {
		var args = this._args(arguments, ['id'], ['id']);
		return this._makeNode(args.parent, 'g', $.extend({id: args.id}, args.settings || {}));
	},

	/* Add a usage reference.
	   Specify all of x, y, width, height or none of them.
	   @param  parent    (element or jQuery) the parent node for the new node (optional)
	   @param  x         (number) the x-coordinate for the left edge of the node (optional)
	   @param  y         (number) the y-coordinate for the top edge of the node (optional)
	   @param  width     (number) the width of the node (optional)
	   @param  height    (number) the height of the node (optional)
	   @param  ref       (string) the ID of the definition node
	   @param  settings  (object) additional settings for the node (optional)
	   @return  (element) the new node */
	use: function(parent, x, y, width, height, ref, settings) {
		var args = this._args(arguments, ['x', 'y', 'width', 'height', 'ref']);
		if (typeof args.x == 'string') {
			args.ref = args.x;
			args.settings = args.y;
			args.x = args.y = args.width = args.height = null;
		}
		var node = this._makeNode(args.parent, 'use', $.extend(
			{x: args.x, y: args.y, width: args.width, height: args.height},
			args.settings || {}));
		node.setAttributeNS($.svg.xlinkNS, 'href', args.ref);
		return node;
	},

	/* Add a link, which applies to all child elements.
	   @param  parent    (element or jQuery) the parent node for the new link (optional)
	   @param  ref       (string) the target URL
	   @param  settings  (object) additional settings for the link (optional)
	   @return  (element) the new link node */
	link: function(parent, ref, settings) {
		var args = this._args(arguments, ['ref']);
		var node = this._makeNode(args.parent, 'a', args.settings);
		node.setAttributeNS($.svg.xlinkNS, 'href', args.ref);
		return node;
	},

	/* Add an image.
	   @param  parent    (element or jQuery) the parent node for the new image (optional)
	   @param  x         (number) the x-coordinate for the left edge of the image
	   @param  y         (number) the y-coordinate for the top edge of the image
	   @param  width     (number) the width of the image
	   @param  height    (number) the height of the image
	   @param  ref       (string) the path to the image
	   @param  settings  (object) additional settings for the image (optional)
	   @return  (element) the new image node */
	image: function(parent, x, y, width, height, ref, settings) {
		var args = this._args(arguments, ['x', 'y', 'width', 'height', 'ref']);
		var node = this._makeNode(args.parent, 'image', $.extend(
			{x: args.x, y: args.y, width: args.width, height: args.height},
			args.settings || {}));
		node.setAttributeNS($.svg.xlinkNS, 'href', args.ref);
		return node;
	},

	/* Draw a path.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  path      (string or SVGPath) the path to draw
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	path: function(parent, path, settings) {
		var args = this._args(arguments, ['path']);
		return this._makeNode(args.parent, 'path', $.extend(
			{d: (args.path.path ? args.path.path() : args.path)}, args.settings || {}));
	},

	/* Draw a rectangle.
	   Specify both of rx and ry or neither.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  x         (number) the x-coordinate for the left edge of the rectangle
	   @param  y         (number) the y-coordinate for the top edge of the rectangle
	   @param  width     (number) the width of the rectangle
	   @param  height    (number) the height of the rectangle
	   @param  rx        (number) the x-radius of the ellipse for the rounded corners (optional)
	   @param  ry        (number) the y-radius of the ellipse for the rounded corners (optional)
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	rect: function(parent, x, y, width, height, rx, ry, settings) {
		var args = this._args(arguments, ['x', 'y', 'width', 'height', 'rx', 'ry'], ['rx']);
		return this._makeNode(args.parent, 'rect', $.extend(
			{x: args.x, y: args.y, width: args.width, height: args.height},
			(args.rx ? {rx: args.rx, ry: args.ry} : {}), args.settings || {}));
	},

	/* Draw a circle.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  cx        (number) the x-coordinate for the centre of the circle
	   @param  cy        (number) the y-coordinate for the centre of the circle
	   @param  r         (number) the radius of the circle
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	circle: function(parent, cx, cy, r, settings) {
		var args = this._args(arguments, ['cx', 'cy', 'r']);
		return this._makeNode(args.parent, 'circle', $.extend(
			{cx: args.cx, cy: args.cy, r: args.r}, args.settings || {}));
	},

	/* Draw an ellipse.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  cx        (number) the x-coordinate for the centre of the ellipse
	   @param  cy        (number) the y-coordinate for the centre of the ellipse
	   @param  rx        (number) the x-radius of the ellipse
	   @param  ry        (number) the y-radius of the ellipse
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	ellipse: function(parent, cx, cy, rx, ry, settings) {
		var args = this._args(arguments, ['cx', 'cy', 'rx', 'ry']);
		return this._makeNode(args.parent, 'ellipse', $.extend(
			{cx: args.cx, cy: args.cy, rx: args.rx, ry: args.ry}, args.settings || {}));
	},

	/* Draw a line.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  x1        (number) the x-coordinate for the start of the line
	   @param  y1        (number) the y-coordinate for the start of the line
	   @param  x2        (number) the x-coordinate for the end of the line
	   @param  y2        (number) the y-coordinate for the end of the line
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	line: function(parent, x1, y1, x2, y2, settings) {
		var args = this._args(arguments, ['x1', 'y1', 'x2', 'y2']);
		return this._makeNode(args.parent, 'line', $.extend(
			{x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2}, args.settings || {}));
	},

	/* Draw a polygonal line.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  points    (number[][]) the x-/y-coordinates for the points on the line
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	polyline: function(parent, points, settings) {
		var args = this._args(arguments, ['points']);
		return this._poly(args.parent, 'polyline', args.points, args.settings);
	},

	/* Draw a polygonal shape.
	   @param  parent    (element or jQuery) the parent node for the new shape (optional)
	   @param  points    (number[][]) the x-/y-coordinates for the points on the shape
	   @param  settings  (object) additional settings for the shape (optional)
	   @return  (element) the new shape node */
	polygon: function(parent, points, settings) {
		var args = this._args(arguments, ['points']);
		return this._poly(args.parent, 'polygon', args.points, args.settings);
	},

	/* Draw a polygonal line or shape. */
	_poly: function(parent, name, points, settings) {
		var ps = '';
		for (var i = 0; i < points.length; i++) {
			ps += points[i].join() + ' ';
		}
		return this._makeNode(parent, name, $.extend(
			{points: $.trim(ps)}, settings || {}));
	},

	/* Draw text.
	   Specify both of x and y or neither of them.
	   @param  parent    (element or jQuery) the parent node for the text (optional)
	   @param  x         (number or number[]) the x-coordinate(s) for the text (optional)
	   @param  y         (number or number[]) the y-coordinate(s) for the text (optional)
	   @param  value     (string) the text content or
	                     (SVGText) text with spans and references
	   @param  settings  (object) additional settings for the text (optional)
	   @return  (element) the new text node */
	text: function(parent, x, y, value, settings) {
		var args = this._args(arguments, ['x', 'y', 'value']);
		if (typeof args.x == 'string' && arguments.length < 4) {
			args.value = args.x;
			args.settings = args.y;
			args.x = args.y = null;
		}
		return this._text(args.parent, 'text', args.value, $.extend(
			{x: (args.x && isArray(args.x) ? args.x.join(' ') : args.x),
			y: (args.y && isArray(args.y) ? args.y.join(' ') : args.y)}, 
			args.settings || {}));
	},

	/* Draw text along a path.
	   @param  parent    (element or jQuery) the parent node for the text (optional)
	   @param  path      (string) the ID of the path
	   @param  value     (string) the text content or
	                     (SVGText) text with spans and references
	   @param  settings  (object) additional settings for the text (optional)
	   @return  (element) the new text node */
	textpath: function(parent, path, value, settings) {
		var args = this._args(arguments, ['path', 'value']);
		var node = this._text(args.parent, 'textPath', args.value, args.settings || {});
		node.setAttributeNS($.svg.xlinkNS, 'href', args.path);
		return node;
	},

	/* Draw text. */
	_text: function(parent, name, value, settings) {
		var node = this._makeNode(parent, name, settings);
		if (typeof value == 'string') {
			node.appendChild(node.ownerDocument.createTextNode(value));
		}
		else {
			for (var i = 0; i < value._parts.length; i++) {
				var part = value._parts[i];
				if (part[0] == 'tspan') {
					var child = this._makeNode(node, part[0], part[2]);
					child.appendChild(node.ownerDocument.createTextNode(part[1]));
					node.appendChild(child);
				}
				else if (part[0] == 'tref') {
					var child = this._makeNode(node, part[0], part[2]);
					child.setAttributeNS($.svg.xlinkNS, 'href', part[1]);
					node.appendChild(child);
				}
				else if (part[0] == 'textpath') {
					var set = $.extend({}, part[2]);
					set.href = null;
					var child = this._makeNode(node, part[0], set);
					child.setAttributeNS($.svg.xlinkNS, 'href', part[2].href);
					child.appendChild(node.ownerDocument.createTextNode(part[1]));
					node.appendChild(child);
				}
				else { // straight text
					node.appendChild(node.ownerDocument.createTextNode(part[1]));
				}
			}
		}
		return node;
	},

	/* Add a custom SVG element.
	   @param  parent    (element or jQuery) the parent node for the new element (optional)
	   @param  name      (string) the name of the element
	   @param  settings  (object) additional settings for the element (optional)
	   @return  (element) the new custom node */
	other: function(parent, name, settings) {
		var args = this._args(arguments, ['name']);
		return this._makeNode(args.parent, args.name, args.settings || {});
	},

	/* Create a shape node with the given settings. */
	_makeNode: function(parent, name, settings) {
		parent = parent || this._svg;
		var node = this._svg.ownerDocument.createElementNS($.svg.svgNS, name);
		for (var name in settings) {
			var value = settings[name];
			if (value != null && value != null && 
					(typeof value != 'string' || value != '')) {
				node.setAttribute($.svg._attrNames[name] || name, value);
			}
		}
		parent.appendChild(node);
		return node;
	},

	/* Add an existing SVG node to the diagram.
	   @param  parent  (element or jQuery) the parent node for the new node (optional)
	   @param  node    (element) the new node to add or
	                   (string) the jQuery selector for the node or
	                   (jQuery collection) set of nodes to add
	   @return  (SVGWrapper) this wrapper */
	add: function(parent, node) {
		var args = this._args((arguments.length == 1 ? [null, parent] : arguments), ['node']);
		var svg = this;
		args.parent = args.parent || this._svg;
		args.node = (args.node.jquery ? args.node : $(args.node));
		try {
			if ($.svg._renesis) {
				throw 'Force traversal';
			}
			args.parent.appendChild(args.node.cloneNode(true));
		}
		catch (e) {
			args.node.each(function() {
				var child = svg._cloneAsSVG(this);
				if (child) {
					args.parent.appendChild(child);
				}
			});
		}
		return this;
	},

	/* Clone an existing SVG node and add it to the diagram.
	   @param  parent  (element or jQuery) the parent node for the new node (optional)
	   @param  node    (element) the new node to add or
	                   (string) the jQuery selector for the node or
	                   (jQuery collection) set of nodes to add
	   @return  (element[]) collection of new nodes */
	clone: function(parent, node) {
		var svg = this;
		var args = this._args((arguments.length == 1 ? [null, parent] : arguments), ['node']);
		args.parent = args.parent || this._svg;
		args.node = (args.node.jquery ? args.node : $(args.node));
		var newNodes = [];
		args.node.each(function() {
			var child = svg._cloneAsSVG(this);
			if (child) {
				child.id = '';
				args.parent.appendChild(child);
				newNodes.push(child);
			}
		});
		return newNodes;
	},

	/* SVG nodes must belong to the SVG namespace, so clone and ensure this is so.
	   @param  node  (element) the SVG node to clone
	   @return  (element) the cloned node */
	_cloneAsSVG: function(node) {
		var newNode = null;
		if (node.nodeType == 1) { // element
			newNode = this._svg.ownerDocument.createElementNS(
				$.svg.svgNS, this._checkName(node.nodeName));
			for (var i = 0; i < node.attributes.length; i++) {
				var attr = node.attributes.item(i);
				if (attr.nodeName != 'xmlns' && attr.nodeValue) {
					if (attr.prefix == 'xlink') {
						newNode.setAttributeNS($.svg.xlinkNS,
							attr.localName || attr.baseName, attr.nodeValue);
					}
					else {
						newNode.setAttribute(this._checkName(attr.nodeName), attr.nodeValue);
					}
				}
			}
			for (var i = 0; i < node.childNodes.length; i++) {
				var child = this._cloneAsSVG(node.childNodes[i]);
				if (child) {
					newNode.appendChild(child);
				}
			}
		}
		else if (node.nodeType == 3) { // text
			if ($.trim(node.nodeValue)) {
				newNode = this._svg.ownerDocument.createTextNode(node.nodeValue);
			}
		}
		else if (node.nodeType == 4) { // CDATA
			if ($.trim(node.nodeValue)) {
				try {
					newNode = this._svg.ownerDocument.createCDATASection(node.nodeValue);
				}
				catch (e) {
					newNode = this._svg.ownerDocument.createTextNode(
						node.nodeValue.replace(/&/g, '&amp;').
						replace(/</g, '&lt;').replace(/>/g, '&gt;'));
				}
			}
		}
		return newNode;
	},

	/* Node names must be lower case and without SVG namespace prefix. */
	_checkName: function(name) {
		name = (name.substring(0, 1) >= 'A' && name.substring(0, 1) <= 'Z' ?
			name.toLowerCase() : name);
		return (name.substring(0, 4) == 'svg:' ? name.substring(4) : name);
	},

	/* Load an external SVG document.
	   @param  url       (string) the location of the SVG document or
	                     the actual SVG content
	   @param  settings  (boolean) see addTo below or
	                     (function) see onLoad below or
	                     (object) additional settings for the load with attributes below:
	                       addTo       (boolean) true to add to what's already there,
	                                   or false to clear the canvas first
						   changeSize  (boolean) true to allow the canvas size to change,
	                                   or false to retain the original
	                       onLoad      (function) callback after the document has loaded,
	                                   'this' is the container, receives SVG object and
	                                   optional error message as a parameter
	                       parent      (string or element or jQuery) the parent to load
	                                   into, defaults to top-level svg element
	   @return  (SVGWrapper) this root */
	load: function(url, settings) {
		settings = (typeof settings == 'boolean' ? {addTo: settings} :
			(typeof settings == 'function' ? {onLoad: settings} :
			(typeof settings == 'string' ? {parent: settings} : 
			(typeof settings == 'object' && settings.nodeName ? {parent: settings} :
			(typeof settings == 'object' && settings.jquery ? {parent: settings} :
			settings || {})))));
		if (!settings.parent && !settings.addTo) {
			this.clear(false);
		}
		var size = [this._svg.getAttribute('width'), this._svg.getAttribute('height')];
		var wrapper = this;
		// Report a problem with the load
		var reportError = function(message) {
			message = $.svg.local.errorLoadingText + ': ' + message;
			if (settings.onLoad) {
				settings.onLoad.apply(wrapper._container || wrapper._svg, [wrapper, message]);
			}
			else {
				wrapper.text(null, 10, 20, message);
			}
		};
		// Create a DOM from SVG content
		var loadXML4IE = function(data) {
			var xml = new ActiveXObject('Microsoft.XMLDOM');
			xml.validateOnParse = false;
			xml.resolveExternals = false;
			xml.async = false;
			xml.loadXML(data);
			if (xml.parseError.errorCode != 0) {
				reportError(xml.parseError.reason);
				return null;
			}
			return xml;
		};
		// Load the SVG DOM
		var loadSVG = function(data) {
			if (!data) {
				return;
			}
			if (data.documentElement.nodeName != 'svg') {
				var errors = data.getElementsByTagName('parsererror');
				var messages = (errors.length ? errors[0].getElementsByTagName('div') : []); // Safari
				reportError(!errors.length ? '???' :
					(messages.length ? messages[0] : errors[0]).firstChild.nodeValue);
				return;
			}
			var parent = (settings.parent ? $(settings.parent)[0] : wrapper._svg);
			var attrs = {};
			for (var i = 0; i < data.documentElement.attributes.length; i++) {
				var attr = data.documentElement.attributes.item(i);
				if (!(attr.nodeName == 'version' || attr.nodeName.substring(0, 5) == 'xmlns')) {
					attrs[attr.nodeName] = attr.nodeValue;
				}
			}
			wrapper.configure(parent, attrs, !settings.parent);
			var nodes = data.documentElement.childNodes;
			for (var i = 0; i < nodes.length; i++) {
				try {
					if ($.svg._renesis) {
						throw 'Force traversal';
					}
					parent.appendChild(wrapper._svg.ownerDocument.importNode(nodes[i], true));
					if (nodes[i].nodeName == 'script') {
						$.globalEval(nodes[i].textContent);
					}
				}
				catch (e) {
					wrapper.add(parent, nodes[i]);
				}
			}
			if (!settings.changeSize) {
				wrapper.configure(parent, {width: size[0], height: size[1]});
			}
			if (settings.onLoad) {
				settings.onLoad.apply(wrapper._container || wrapper._svg, [wrapper]);
			}
		};
		if (url.match('<svg')) { // Inline SVG
			loadSVG($.browser.msie ? loadXML4IE(url) :
				new DOMParser().parseFromString(url, 'text/xml'));
		}
		else { // Remote SVG
			$.ajax({url: url, dataType: ($.browser.msie ? 'text' : 'xml'),
				success: function(xml) {
					loadSVG($.browser.msie ? loadXML4IE(xml) : xml);
				}, error: function(http, message, exc) {
					reportError(message + (exc ? ' ' + exc.message : ''));
				}});
		}
		return this;
	},

	/* Delete a specified node.
	   @param  node  (element or jQuery) the drawing node to remove
	   @return  (SVGWrapper) this root */
	remove: function(node) {
		node = (node.jquery ? node[0] : node);
		node.parentNode.removeChild(node);
		return this;
	},

	/* Delete everything in the current document.
	   @param  attrsToo  (boolean) true to clear any root attributes as well,
	                     false to leave them (optional)
	   @return  (SVGWrapper) this root */
	clear: function(attrsToo) {
		if (attrsToo) {
			this.configure({}, true);
		}
		while (this._svg.firstChild) {
			this._svg.removeChild(this._svg.firstChild);
		}
		return this;
	},

	/* Serialise the current diagram into an SVG text document.
	   @param  node  (SVG element) the starting node (optional)
	   @return  (string) the SVG as text */
	toSVG: function(node) {
		node = node || this._svg;
		return (typeof XMLSerializer == 'undefined' ? this._toSVG(node) :
			new XMLSerializer().serializeToString(node));
	},

	/* Serialise one node in the SVG hierarchy. */
	_toSVG: function(node) {
		var svgDoc = '';
		if (!node) {
			return svgDoc;
		}
		if (node.nodeType == 3) { // Text
			svgDoc = node.nodeValue;
		}
		else if (node.nodeType == 4) { // CDATA
			svgDoc = '<![CDATA[' + node.nodeValue + ']]>';
		}
		else { // Element
			svgDoc = '<' + node.nodeName;
			if (node.attributes) {
				for (var i = 0; i < node.attributes.length; i++) {
					var attr = node.attributes.item(i);
					if (!($.trim(attr.nodeValue) == '' || attr.nodeValue.match(/^\[object/) ||
							attr.nodeValue.match(/^function/))) {
						svgDoc += ' ' + (attr.namespaceURI == $.svg.xlinkNS ? 'xlink:' : '') + 
							attr.nodeName + '="' + attr.nodeValue + '"';
					}
				}
			}	
			if (node.firstChild) {
				svgDoc += '>';
				var child = node.firstChild;
				while (child) {
					svgDoc += this._toSVG(child);
					child = child.nextSibling;
				}
				svgDoc += '</' + node.nodeName + '>';
			}
				else {
				svgDoc += '/>';
			}
		}
		return svgDoc;
	}
});

/* Helper to generate an SVG path.
   Obtain an instance from the SVGWrapper object.
   String calls together to generate the path and use its value:
   var path = root.createPath();
   root.path(null, path.move(100, 100).line(300, 100).line(200, 300).close(), {fill: 'red'});
   or
   root.path(null, path.move(100, 100).line([[300, 100], [200, 300]]).close(), {fill: 'red'}); */
function SVGPath() {
	this._path = '';
}

$.extend(SVGPath.prototype, {
	/* Prepare to create a new path.
	   @return  (SVGPath) this path */
	reset: function() {
		this._path = '';
		return this;
	},

	/* Move the pointer to a position.
	   @param  x         (number) x-coordinate to move to or
	                     (number[][]) x-/y-coordinates to move to
	   @param  y         (number) y-coordinate to move to (omitted if x is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	move: function(x, y, relative) {
		relative = (isArray(x) ? y : relative);
		return this._coords((relative ? 'm' : 'M'), x, y);
	},

	/* Draw a line to a position.
	   @param  x         (number) x-coordinate to move to or
	                     (number[][]) x-/y-coordinates to move to
	   @param  y         (number) y-coordinate to move to (omitted if x is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	line: function(x, y, relative) {
		relative = (isArray(x) ? y : relative);
		return this._coords((relative ? 'l' : 'L'), x, y);
	},

	/* Draw a horizontal line to a position.
	   @param  x         (number) x-coordinate to draw to or
	                     (number[]) x-coordinates to draw to
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	horiz: function(x, relative) {
		this._path += (relative ? 'h' : 'H') + (isArray(x) ? x.join(' ') : x);
		return this;
	},

	/* Draw a vertical line to a position.
	   @param  y         (number) y-coordinate to draw to or
	                     (number[]) y-coordinates to draw to
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	vert: function(y, relative) {
		this._path += (relative ? 'v' : 'V') + (isArray(y) ? y.join(' ') : y);
		return this;
	},

	/* Draw a cubic Bézier curve.
	   @param  x1        (number) x-coordinate of beginning control point or
	                     (number[][]) x-/y-coordinates of control and end points to draw to
	   @param  y1        (number) y-coordinate of beginning control point (omitted if x1 is array)
	   @param  x2        (number) x-coordinate of ending control point (omitted if x1 is array)
	   @param  y2        (number) y-coordinate of ending control point (omitted if x1 is array)
	   @param  x         (number) x-coordinate of curve end (omitted if x1 is array)
	   @param  y         (number) y-coordinate of curve end (omitted if x1 is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	curveC: function(x1, y1, x2, y2, x, y, relative) {
		relative = (isArray(x1) ? y1 : relative);
		return this._coords((relative ? 'c' : 'C'), x1, y1, x2, y2, x, y);
	},

	/* Continue a cubic Bézier curve.
	   Starting control point is the reflection of the previous end control point.
	   @param  x2        (number) x-coordinate of ending control point or
	                     (number[][]) x-/y-coordinates of control and end points to draw to
	   @param  y2        (number) y-coordinate of ending control point (omitted if x2 is array)
	   @param  x         (number) x-coordinate of curve end (omitted if x2 is array)
	   @param  y         (number) y-coordinate of curve end (omitted if x2 is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	smoothC: function(x2, y2, x, y, relative) {
		relative = (isArray(x2) ? y2 : relative);
		return this._coords((relative ? 's' : 'S'), x2, y2, x, y);
	},

	/* Draw a quadratic Bézier curve.
	   @param  x1        (number) x-coordinate of control point or
	                     (number[][]) x-/y-coordinates of control and end points to draw to
	   @param  y1        (number) y-coordinate of control point (omitted if x1 is array)
	   @param  x         (number) x-coordinate of curve end (omitted if x1 is array)
	   @param  y         (number) y-coordinate of curve end (omitted if x1 is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	curveQ: function(x1, y1, x, y, relative) {
		relative = (isArray(x1) ? y1 : relative);
		return this._coords((relative ? 'q' : 'Q'), x1, y1, x, y);
	},

	/* Continue a quadratic Bézier curve.
	   Control point is the reflection of the previous control point.
	   @param  x         (number) x-coordinate of curve end or
	                     (number[][]) x-/y-coordinates of points to draw to
	   @param  y         (number) y-coordinate of curve end (omitted if x is array)
	   @param  relative  (boolean) true for coordinates relative to the current point,
	                     false for coordinates being absolute
	   @return  (SVGPath) this path */
	smoothQ: function(x, y, relative) {
		relative = (isArray(x) ? y : relative);
		return this._coords((relative ? 't' : 'T'), x, y);
	},

	/* Generate a path command with (a list of) coordinates. */
	_coords: function(cmd, x1, y1, x2, y2, x3, y3) {
		if (isArray(x1)) {
			for (var i = 0; i < x1.length; i++) {
				var cs = x1[i];
				this._path += (i == 0 ? cmd : ' ') + cs[0] + ',' + cs[1] +
					(cs.length < 4 ? '' : ' ' + cs[2] + ',' + cs[3] +
					(cs.length < 6 ? '': ' ' + cs[4] + ',' + cs[5]));
			}
		}
		else {
			this._path += cmd + x1 + ',' + y1 + 
				(x2 == null ? '' : ' ' + x2 + ',' + y2 +
				(x3 == null ? '' : ' ' + x3 + ',' + y3));
		}
		return this;
	},

	/* Draw an arc to a position.
	   @param  rx         (number) x-radius of arc or
	                      (number/boolean[][]) x-/y-coordinates and flags for points to draw to
	   @param  ry         (number) y-radius of arc (omitted if rx is array)
	   @param  xRotate    (number) x-axis rotation (degrees, clockwise) (omitted if rx is array)
	   @param  large      (boolean) true to draw the large part of the arc,
	                      false to draw the small part (omitted if rx is array)
	   @param  clockwise  (boolean) true to draw the clockwise arc,
	                      false to draw the anti-clockwise arc (omitted if rx is array)
	   @param  x          (number) x-coordinate of arc end (omitted if rx is array)
	   @param  y          (number) y-coordinate of arc end (omitted if rx is array)
	   @param  relative   (boolean) true for coordinates relative to the current point,
	                      false for coordinates being absolute
	   @return  (SVGPath) this path */
	arc: function(rx, ry, xRotate, large, clockwise, x, y, relative) {
		relative = (isArray(rx) ? ry : relative);
		this._path += (relative ? 'a' : 'A');
		if (isArray(rx)) {
			for (var i = 0; i < rx.length; i++) {
				var cs = rx[i];
				this._path += (i == 0 ? '' : ' ') + cs[0] + ',' + cs[1] + ' ' +
					cs[2] + ' ' + (cs[3] ? '1' : '0') + ',' +
					(cs[4] ? '1' : '0') + ' ' + cs[5] + ',' + cs[6];
			}
		}
		else {
			this._path += rx + ',' + ry + ' ' + xRotate + ' ' +
				(large ? '1' : '0') + ',' + (clockwise ? '1' : '0') + ' ' + x + ',' + y;
		}
		return this;
	},

	/* Close the current path.
	   @return  (SVGPath) this path */
	close: function() {
		this._path += 'z';
		return this;
	},

	/* Return the string rendering of the specified path.
	   @return  (string) stringified path */
	path: function() {
		return this._path;
	}
});

SVGPath.prototype.moveTo = SVGPath.prototype.move;
SVGPath.prototype.lineTo = SVGPath.prototype.line;
SVGPath.prototype.horizTo = SVGPath.prototype.horiz;
SVGPath.prototype.vertTo = SVGPath.prototype.vert;
SVGPath.prototype.curveCTo = SVGPath.prototype.curveC;
SVGPath.prototype.smoothCTo = SVGPath.prototype.smoothC;
SVGPath.prototype.curveQTo = SVGPath.prototype.curveQ;
SVGPath.prototype.smoothQTo = SVGPath.prototype.smoothQ;
SVGPath.prototype.arcTo = SVGPath.prototype.arc;

/* Helper to generate an SVG text object.
   Obtain an instance from the SVGWrapper object.
   String calls together to generate the text and use its value:
   var text = root.createText();
   root.text(null, x, y, text.string('This is ').
     span('red', {fill: 'red'}).string('!'), {fill: 'blue'}); */
function SVGText() {
	this._parts = []; // The components of the text object
}

$.extend(SVGText.prototype, {
	/* Prepare to create a new text object.
	   @return  (SVGText) this text */
	reset: function() {
		this._parts = [];
		return this;
	},

	/* Add a straight string value.
	   @param  value  (string) the actual text
	   @return  (SVGText) this text object */
	string: function(value) {
		this._parts[this._parts.length] = ['text', value];
		return this;
	},

	/* Add a separate text span that has its own settings.
	   @param  value     (string) the actual text
	   @param  settings  (object) the settings for this text
	   @return  (SVGText) this text object */
	span: function(value, settings) {
		this._parts[this._parts.length] = ['tspan', value, settings];
		return this;
	},

	/* Add a reference to a previously defined text string.
	   @param  id        (string) the ID of the actual text
	   @param  settings  (object) the settings for this text
	   @return  (SVGText) this text object */
	ref: function(id, settings) {
		this._parts[this._parts.length] = ['tref', id, settings];
		return this;
	},

	/* Add text drawn along a path.
	   @param  id        (string) the ID of the path
	   @param  value     (string) the actual text
	   @param  settings  (object) the settings for this text
	   @return  (SVGText) this text object */
	path: function(id, value, settings) {
		this._parts[this._parts.length] = ['textpath', value, 
			$.extend({href: id}, settings || {})];
		return this;
	}
});

/* Attach the SVG functionality to a jQuery selection.
   @param  command  (string) the command to run (optional, default 'attach')
   @param  options  (object) the new settings to use for these SVG instances
   @return jQuery (object) for chaining further calls */
$.fn.svg = function(options) {
	var otherArgs = Array.prototype.slice.call(arguments, 1);
	if (typeof options == 'string' && options == 'get') {
		return $.svg['_' + options + 'SVG'].apply($.svg, [this[0]].concat(otherArgs));
	}
	return this.each(function() {
		if (typeof options == 'string') {
			$.svg['_' + options + 'SVG'].apply($.svg, [this].concat(otherArgs));
		}
		else {
			$.svg._attachSVG(this, options || {});
		} 
	});
};

/* Determine whether an object is an array. */
function isArray(a) {
	return (a && a.constructor == Array);
}

// Singleton primary SVG interface
$.svg = new SVGManager();

})(jQuery);

define("jquery-svg", function(){});

/*globals define */
/*jslint plusplus:true, white:true, vars:true, regexp:true, nomen:true */
/*jshint jquery:true, browser:true, funcscope:true, laxbreak:true, laxcomma:true */

// Module core/regpict
// Handles register pictures in the document. This encompasses two primary operations. One is
// extracting register information from a variety of table styles. The other is inventing an
// svg diagram that represents the fields in the table.
define(
    'core/regpict',["text!core/css/regpict.css",
     "jquery",
     "core/utils",
     "jquery-svg"],
    function(css) {
        "use strict";

        function pget(obj, prop, def) {
            if ((obj !== null) && obj.hasOwnProperty(prop)) {
                return obj[prop];
            }
            return def;
        }

        function draw_regpict(divsvg, svg, reg) {
            var width = Number(pget(reg, "width", 32));
            var left_to_right = Boolean(pget(reg, "leftToRight", false));
            var debug = Boolean(pget(reg, "debug", false));
            var defaultUnused = String(pget(reg, "defaultUnused", "RsvdP"));
            var defaultAttr = String(pget(reg, "defaultAttr", "other"));
            var cellWidth = Number(pget(reg, "cellWidth", 16));
            var cellHeight = Number(pget(reg, "cellHeight", 32));
            var cellInternalHeight = Number(pget(reg, "cellInternalHeight", 8));
            var cellValueTop = Number(pget(reg, "cellValueTop", 20)); // top of text for regFieldValueInternal
            var cellBitValueTop = Number(pget(reg, "cellBitValueTop", 20)); // top of text for regFieldBitValue
            var cellNameTop = Number(pget(reg, "cellNameTop", 16)); // top of text for regFieldNameInternal
            var bracketHeight = Number(pget(reg, "bracketHeight", 4));
            var cellTop = Number(pget(reg, "cellTop", 40));
            var bitWidthPos = Number(pget(reg, "bitWidthPos", 20));
            var figName = String(pget(reg, "figName", "???"));
            var maxFigWidth = Number(pget(reg, "maxFigWidth", 720));   // 7.5 inches (assuming 96 px per inch)
            var figLeft = Number(pget(reg, "figLeft", 40));
            var visibleLSB = Number(pget(reg, "visibleLSB", 0));
            var visibleMSB = Number(pget(reg, "visibleMSB", width));
            var fields = pget(reg, "fields", { }); // default to empty register
            var temp;

            if (visibleMSB < 0) {
                visibleMSB = 0;
            }
            if (visibleMSB > width) {
                visibleMSB = width;
            }
            if (visibleLSB < 0) {
                visibleLSB = 0;
            }
            if (visibleLSB > width) {
                visibleLSB = width;
            }
            //console.log("draw_regpict: width=" + width + " defaultUnused ='" + defaultUnused + "' cellWidth=" + cellWidth + " cellHeight=" + cellHeight + " cellInternalHeight=" + cellInternalHeight + " cellTop=" + cellTop + " bracketHeight=" + bracketHeight);
            //console.log("draw_regpict: fields=" + fields.toString());

            // sanitize field array to avoid subsequent problems
            for (var index in fields) {
                if (fields.hasOwnProperty(index)) {
                    var item = fields[index];
                    if (item.hasOwnProperty("msb") && !item.hasOwnProperty("lsb")) {
                        item.lsb = item.msb;
                    }
                    if (item.hasOwnProperty("lsb") && !item.hasOwnProperty("msb")) {
                        item.msb = item.lsb;
                    }
                    if (item.msb < item.lsb) {
                        temp = item.lsb;
                        item.lsb = item.msb;
                        item.msb = temp;
                    }
                    if (!item.hasOwnProperty("isUnused")) {
                        item.isUnused = false;
                    }
                    if (!item.hasOwnProperty("attr")) {
                        item.attr = defaultAttr;
                    }
                    if (!item.hasOwnProperty("name")) {
                        item.name = index;
                    }
                    if (!item.hasOwnProperty("value")) {
                        item.value = "";
                    }
                    //console.log("draw_regpict: field msb=" + item.msb + " lsb=" + item.lsb + " attr=" + item.attr + " isUnused=" + item.isUnused + " name='" + item.name + "'");

                }
            }

            var bitarray = [];  // Array indexed by bit # in register range 0:width
            // field[bitarray[N]] contains bit N
            // bitarray[N] == null for unused bits
            // bitarray[N] == 1000 for first bit outside register width

            var i, j;
            bitarray[width] = 1000; //???
            for (i = 0; i < width; i++) {
                bitarray[i] = null;
            }

            for (index in fields) {
                if (fields.hasOwnProperty(index)) {
                    for (i = fields[index].lsb; i <= fields[index].msb; i++) {
                        bitarray[i] = index;
                    }
                }
            }

            var lsb = -1;   // if >= 0, contains bit# of lsb of a string of unused bits 
            for (i = 0; i <= width; ++i) {  // note: includes bitarray[width]
                if (lsb >= 0 && bitarray[i] !== null) {
                    // first "used" bit after stretch of unused bits, invent an "unused" field
                    index = "_unused_" + (i - 1); // _unused_msb
                    if (lsb !== (i - 1)) {
                        index = index + "_" + lsb;  // _unused_msb_lsb
                    }
                    fields[index] = {
                        "msb":      (i - 1),
                        "lsb":      lsb,
                        "name":     ((i - lsb) * 2 - 1) >=
                                    defaultUnused.length ? defaultUnused : defaultUnused[0].toUpperCase(), // use full name if if fits, else use 1st char
                        "attr":     defaultUnused.toLowerCase(),   // attribute is name
                        "isUnused": true,
                        "value":    ""
                    };
                    for (j = lsb; j < i; j++) {
                        bitarray[j] = index;
                    }
                    lsb = -1;
                }
                if (lsb < 0 && bitarray[i] === null) {
                    // starting a string of unused bits
                    lsb = i;
                }
            }

            function max(a, b) {
                return (a > b ? a : b);
            }

            function min(a, b) {
                return (a < b ? a : b);
            }

            // x position of left edge of bit i
            function leftOf(i) {
                var ret;
                var adj_bit = i;
                if (i >= 0) {
                    if (i > visibleMSB) { adj_bit = visibleMSB; }
                    if (i < visibleLSB) { adj_bit = visibleLSB; }
                    if (left_to_right) {
                        adj_bit = adj_bit - visibleLSB;
                    } else {
                        adj_bit = visibleMSB - adj_bit;
                    }
                } else { // negative bit #, always to the right
                    adj_bit = visibleMSB - visibleLSB - i - 0.5;
                }
                ret = figLeft + cellWidth * (adj_bit - 0.5);
                if (debug) {
                    console.log(i + " leftOf   left_to_right=" + left_to_right +
                        " figLeft=" + figLeft +
                        " cellWidth=" + cellWidth +
                        " visibleLSB=" + visibleLSB +
                        " visibleMSB=" + visibleMSB +
                        " adj_bit=" + adj_bit +
                        "\t--> ret=" + ret);
                }
                return ret;
            }

            // x position of right edge of bit i
            function rightOf(i) {
                var ret = -1000;
                var adj_bit = i;
                if (i >= 0) {
                    if (i > visibleMSB) { adj_bit = visibleMSB; }
                    if (i < visibleLSB) { adj_bit = visibleLSB; }
                    if (left_to_right) {
                        adj_bit = adj_bit - visibleLSB;
                    } else {
                        adj_bit = visibleMSB - adj_bit;
                    }
                } else { // negative bit #, always to the right
                    adj_bit = visibleMSB - visibleLSB - i - 0.5;
                }
                ret = figLeft + cellWidth * (adj_bit + 0.5);
                if (debug) {
                    console.log(i + " rightOf  left_to_right=" + left_to_right +
                        " figLeft=" + figLeft +
                        " cellWidth=" + cellWidth +
                        " visibleLSB=" + visibleLSB +
                        " visibleMSB=" + visibleMSB +
                        " adj_bit=" + adj_bit +
                        "\t--> ret=" + ret);
                }
                return ret;
            }

            // x position of middle of bit i
            function middleOf(i) {
                var ret = -1000;
                var adj_bit = i;
                if (i >= 0) {
                    if (i > visibleMSB) { adj_bit = visibleMSB; }
                    if (i < visibleLSB) { adj_bit = visibleLSB; }
                    if (left_to_right) {
                        adj_bit = adj_bit - visibleLSB;
                    } else {
                        adj_bit = visibleMSB - adj_bit;
                    }
                } else { // negative bit #, always to the right
                    adj_bit = visibleMSB - visibleLSB - i - 0.5;
                }
                ret = figLeft + cellWidth * (adj_bit);
                if (debug) {
                    console.log(i + " middleOf left_to_right=" + left_to_right +
                        " figLeft=" + figLeft +
                        " cellWidth=" + cellWidth +
                        " visibleLSB=" + visibleLSB +
                        " visibleMSB=" + visibleMSB +
                        " adj_bit=" + adj_bit +
                        "\t--> ret=" + ret);
                }
                return ret;
            }

            var g, p, f, text;
            var nextBitLine = cellTop + cellHeight + 20; //76;
            var bitLineCount = 0;
            var max_text_width = 0;

            for (var b2 = 0; b2 < width; b2++) {
                var b = (left_to_right ? width - b2 - 1 : b2);
                for (i in fields) {
                    if (fields.hasOwnProperty(i)) {
                        f = fields[i];
                        var gAddClass = ["regFieldInternal", "regAttr_" + f.attr, "regLink"];
                        if (b === f.lsb) {
                            g = svg.group();
                            //var bitnum_width;
                            if (f.lsb === f.msb) {
                                text = svg.text(g, middleOf(f.lsb), cellTop - 4,
                                                svg.createText().string(f.lsb), {
                                        "class_": "regBitNumMiddle"
                                    });
                                if (debug) {
                                    console.log("bitnum-middle " + f.lsb + " at x=" + middleOf(f.lsb) + " y=" + (cellTop - 4));
                                }
                                /*bitnum_width = text.clientWidth;
                                if (bitnum_width === 0) {
                                    // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                                    bitnum_width = String(f.lsb).length * 4; // Assume 4px per character on average
                                }
                                if ((bitnum_width + 2) > cellWidth) {
                                    svg.change(text,
                                               {
                                                   x: middleOf(f.lsb),
                                                   y: cellTop,
                                                   transform: "rotate(270, " +
                                                              middleOf(f.lsb) + ", " +
                                                              (cellTop - 4) + ")",
                                                   "class_": "regBitNumStart"
                                               });
                                    console.log("bitnum-middle " + f.lsb + " at x=" + middleOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
                                }*/
                            } else {
                                var pos;
                                var cls;
                                var str;
                                if (f.lsb < visibleLSB) {
                                    if (left_to_right) {
                                        gAddClass.push("regFieldOverflowMSB");
                                        str = f.lsb + " ... " + visibleLSB;
                                        pos = rightOf(f.lsb) - 2;
                                        cls = "regBitNumEnd";
                                    } else {
                                        gAddClass.push("regFieldOverflowLSB");
                                        str = visibleLSB + " ... " + f.lsb;
                                        pos = leftOf(f.lsb) + 2;
                                        cls = "regBitNumStart";
                                    }
                                } else {
                                    str = f.lsb;
                                    if (left_to_right) {
                                        pos = leftOf(f.lsb) + 2;
                                        cls = "regBitNumStart";
                                    } else {
                                        pos = rightOf(f.lsb) - 2;
                                        cls = "regBitNumEnd";
                                    }
                                }
                                text = svg.text(g, pos, cellTop - 4,
                                                svg.createText().string(str), { "class_": cls });
                                if (debug) {
                                    console.log("bitnum-lsb " + f.lsb + " at x=" + pos + " y=" + (cellTop - 4) + " left_to_right=" + left_to_right);
                                }
                                /*bitnum_width = text.clientWidth;
                                if (bitnum_width === 0) {
                                    // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                                    bitnum_width = String(f.lsb).length * 4; // Assume 4px per character on average
                                }
                                if ((bitnum_width + 2) > ((leftOf(f.msb) - rightOf(f.lsb)) / 2)) {
                                     svg.change(text,
                                               {
                                                   x: middleOf(f.lsb),
                                                   y: cellTop,
                                                   transform: "rotate(270, " +
                                                              rightOf(f.lsb) + ", " +
                                                              (cellTop - 4) + ")",
                                                   "class_": "regBitNumStart"
                                               });
                                    console.log("bitnum-right " + f.lsb + " at x=" + rightOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
                                }*/
                                if (f.msb > visibleMSB) {
                                    if (left_to_right) {
                                        gAddClass.push("regFieldOverflowLSB");
                                        str = visibleMSB + " ... " + f.msb;
                                        pos = leftOf(f.msb) + 2;
                                        cls = "regBitNumStart";
                                    } else {
                                        gAddClass.push("regFieldOverflowMSB");
                                        str = f.msb + " ... " + visibleMSB;
                                        pos = rightOf(f.msb) - 2;
                                        cls = "regBitNumEnd";
                                    }
                                } else {
                                    str = f.msb;
                                    if (left_to_right) {
                                        pos = rightOf(f.msb) - 2;
                                        cls = "regBitNumEnd";
                                    } else {
                                        pos = leftOf(f.msb) + 2;
                                        cls = "regBitNumStart";
                                    }
                                }
                                text = svg.text(g, pos, cellTop - 4,
                                                svg.createText().string(str), { "class_": cls });
                                if (debug) {
                                    console.log("bitnum-msb " + f.msb + " at x=" + pos + " y=" + (cellTop - 4) + " left_to_right=" + left_to_right);
                                }
                                /*bitnum_width = text.clientWidth;
                                if (bitnum_width === 0) {
                                    // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                                    bitnum_width = String(f.msb).length * 4; // Assume 4px per character on average
                                }
                                if ((bitnum_width + 2) > ((leftOf(f.msb) - rightOf(f.lsb)) / 2)) {
                                    svg.change(text,
                                               {
                                                   x: middleOf(f.msb),
                                                   y: cellTop,
                                                   transform: "rotate(270, " +
                                                              leftOf(f.msb) + ", " +
                                                              (cellTop - 4) + ")",
                                                   "class_": "regBitNumStart"
                                               });
                                    console.log("bitnum-left " + f.lsb + " at x=" + leftOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
                                }*/
                            }
                            if (f.lsb >= visibleLSB) {
                                var pos = (left_to_right ? leftOf(f.lsb) : rightOf(f.lsb));
                                svg.line(g,
                                    pos, cellTop,
                                    pos, cellTop - (text.clientHeight * 0.75),
                                    {"class_": (f.lsb === visibleLSB) ? "regBitNumLine" : "regBitNumLine_Hide"});
                            }
                            if (f.msb <= visibleMSB) {
                                var pos = (left_to_right ? rightOf(f.msb) : leftOf(f.msb));
                                svg.line(g,
                                    pos, cellTop,
                                    pos, cellTop - (text.clientHeight * 0.75),
                                    {"class_": "regBitNumLine"});
                            }
                            if (f.hasOwnProperty("addClass") && typeof f.addClass === "string") {
                                gAddClass = gAddClass.concat(f.addClass.split(/\s+/));
                            }
                            if (f.isUnused) {
                                gAddClass.push("regFieldUnused");
                            }
                            var wid;
                            if (left_to_right) {
                                pos = leftOf(f.lsb);
                                wid = rightOf(f.msb) - pos;
                            } else {
                                pos = leftOf(f.msb);
                                wid = rightOf(f.lsb) - pos;
                            }
                            svg.rect(g, pos, cellTop, wid, cellHeight, 0, 0,
                                     { "class_": "regFieldBox" });
                            for (j = f.lsb + 1; j <= f.msb; j++) {
                                if ((j >= visibleLSB) && (j <= visibleMSB)) {
                                    var pos = (left_to_right ? leftOf(j) : rightOf(j));
                                    svg.line(g,
                                        pos, cellTop + cellHeight - cellInternalHeight,
                                        pos, cellTop + cellHeight,
                                        { "class_": "regFieldBox" });
                                }
                            }
                            text = svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop - bitWidthPos,
                                            svg.createText().string((f.msb === f.lsb)
                                                                        ? "1 bit"
                                                                        : (f.msb - f.lsb + 1) + " bits"),
                                            { "class_": "regBitWidth" });
                            text = svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop + cellNameTop,
                                            svg.createText().string(f.name),
                                            { "class_": "regFieldName" });
                            if ((!f.isUnused) && (f.lsb <= visibleMSB) && (f.msb >= visibleLSB)) {
                                var $temp_dom = $("<span></span>").prependTo(divsvg);
                                var unique_id = $temp_dom.makeID("regpict", (f.id ? f.id : (figName + "-" + f.name)));
                                $temp_dom.remove();
                                svg.change(g, { id: unique_id });
                            }
                            if (f.value !== "") {
                                if (Array.isArray(f.value) && f.value.length === (f.msb - f.lsb + 1)) {
                                    for (i = 0; i < f.value.length; ++i) {
                                        svg.text(g, (leftOf(f.lsb + i) + rightOf(f.lsb + i)) / 2,
                                                 cellTop + cellBitValueTop,
                                                 svg.createText().string(f.value[i]),
                                                 {
                                                     "class_": ("regFieldValue regFieldBitValue" +
                                                                " regFieldBitValue-" + i.toString() +
                                                                ((i === (f.value.length - 1)) ?
                                                                    " regFieldBitValue-msb" : ""))
                                                 });
                                    }
                                } else if ((typeof(f.value) === "string") || (f.value instanceof String)) {
                                    svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2,
                                             cellTop + (f.msb === f.lsb ? cellBitValueTop : cellValueTop),
                                             svg.createText().string(f.value),
                                             { "class_": "regFieldValue" });
                                } else {
                                    svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop + cellValueTop,
                                             svg.createText().string("INVALID VALUE"),
                                             { "class_": "svg_error" });
                                }
                            }
                            var text_width = text.clientWidth;
                            if (text_width === 0) {
                                // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                                text_width = f.name.length * 6; // Assume 6px per character on average for 15px height chars
                            }
                            if (text_width > max_text_width) {
                                max_text_width = text_width;
                            }
                            var text_height = text.clientHeight;
                            if (text_height === 0) {
                                // bogus fix to guess width when clientHeight is 0 (e.g. IE10)
                                text_height = 18;             // Assume 18px: 1 row of text, 15px high
                            }
                            var boxLeft = leftOf(left_to_right ? max(visibleLSB, f.lsb) : min(visibleMSB, f.msb));
                            var boxRight = rightOf(left_to_right ? min(visibleMSB, f.msb) : max(visibleLSB, f.lsb));
                            if (debug) {
                                console.log("field " + f.name +
                                    " msb=" + f.msb +
                                    " lsb=" + f.lsb +
                                    " attr=" + f.attr +
                                    " isUnused=" + f.isUnused +
                                    (("id" in f) ? f.id : ""));
                                console.log(" text.clientWidth=" + text.clientWidth +
                                    " text_width=" + text_width +
                                    " text.clientHeight=" + text.clientHeight +
                                    " text_height=" + text_height +
                                    " boxLeft=" + boxLeft +
                                    " boxRight=" + boxRight +
                                    " boxWidth=" + (boxRight - boxLeft));
                            }
                            /* if field has a specified value,
                             the field name is too wide for the box,
                             or the field name is too tall for the box */
                            if ((f.lsb > visibleMSB) || (f.msb < visibleLSB)) {
                                gAddClass[0] = "regFieldHidden";
                            } else {
                                if ((f.value !== "") ||
                                    ((text_width + 2) > (boxRight - boxLeft)) ||
                                    ((text_height + 2) > (cellHeight - cellInternalHeight))) {
                                    svg.change(text,
                                        {
                                            x: rightOf(-0.5),
                                            y: nextBitLine,
                                            "class_": "regFieldName"
                                        });
                                    p = svg.createPath();
                                    p.move(boxLeft, cellTop + cellHeight);
                                    p.line(((boxRight - boxLeft) / 2), bracketHeight, true);
                                    p.line(boxRight, cellTop + cellHeight);
                                    svg.path(g, p,
                                        {
                                            "class_": "regBitBracket",
                                            fill: "none"
                                        });
                                    p = svg.createPath();
                                    p.move((boxLeft + (boxRight - boxLeft) / 2), cellTop + cellHeight + bracketHeight);
                                    p.vert(nextBitLine - text_height / 4);
                                    p.horiz(rightOf(-0.4));
                                    svg.path(g, p,
                                        {
                                            "class_": "regBitLine",
                                            fill: "none"
                                        });
                                    gAddClass[0] = "regFieldExternal";
                                    gAddClass.push("regFieldExternal" + (bitLineCount < 2 ? "0" : "1"));
                                    nextBitLine += text_height + 2;
                                    bitLineCount = (bitLineCount + 1) % 4;
                                }
                            }
                            if ((f.msb > visibleLSB) && (f.lsb < visibleLSB)) {
                                if (left_to_right) {
                                    svg.text(g, leftOf(0) - 2, cellTop + cellNameTop,
                                        svg.createText().string("..."),
                                        { "class_": "regFieldExtendsLeft" });
                                } else {
                                    svg.text(g, rightOf(0) + 2, cellTop + cellNameTop,
                                        svg.createText().string("..."),
                                        {"class_": "regFieldExtendsRight"});
                                }
                            }
                            if ((f.msb > visibleMSB) && (f.lsb < visibleMSB)) {
                                if (left_to_right) {
                                    svg.text(g, rightOf(f.msb) + 2, cellTop + cellNameTop,
                                        svg.createText().string("..."),
                                        { "class_": "regFieldExtendsRight" });
                                } else {
                                    svg.text(g, leftOf(f.msb) - 2, cellTop + cellNameTop,
                                        svg.createText().string("..."),
                                        { "class_": "regFieldExtendsLeft" });
                                }
                            }
                            svg.change(g, { "class_": gAddClass.join(" ") });
                        }
                    }
                }
            }
            var scale = 1.0;
            max_text_width = max_text_width + rightOf(-1);
            if ((maxFigWidth > 0) && (max_text_width > maxFigWidth)) {
                scale = maxFigWidth / max_text_width;
            }
            svg.configure({
                              height:      (scale * nextBitLine) + "px",
                              width:       (scale * max_text_width) + "px",
                              viewBox:     "0 0 " + max_text_width + " " + nextBitLine,
                              "xmlns:xlink": "http://www.w3.org/1999/xlink"
                          });
        }

        return {
            run: function(conf, doc, cb, msg) {
                msg.pub("start", "core/regpict");
                if (!(conf.noReSpecCSS)) {
                    $(doc).find("head link").first().before($("<style></style>").text(css));
                }
                var figNum = 1;
                $("figure.register", doc).each(
                    function() {
                        var parsed, $tbody, pattern, bitpattern;
                        var $fig = $(this);
                        var json = { };
                        if ($fig.attr("id")) {
                            json.figName = $fig.attr("id").replace(/^fig-/, "");
                        } else if ($fig.attr("title")) {
                            json.figName = $fig.attr("title");
                        } else if ($("figcaption", this)) {
                            json.figName = $("figcaption", this).text();
                        } else {
                            json.figName = "unnamed-" + figNum;
                            figNum++;
                        }
                        json.figName = json.figName
                            .replace(/^\s+/, "")
                            .replace(/\s+$/, "")
                            .replace(/[^\-.0-9a-z_]+/ig, "-")
                            .replace(/^-+/, "")
                            .replace(/-+$/, "")
                            .replace(/\.$/, ".x")
                            .replace(/^([^a-z])/i, "x$1")
                            .replace(/^$/, "generatedID");
                        if (!$fig.attr("id")) {
                            $fig.attr("id", "fig-" + json.figName);
                        }
                        msg.pub("start", "core/regpict figure id='" + $fig.attr("id") + "'");

                        var temp = $fig.attr("data-json");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            $.extend(true, json, $.parseJSON(temp));
                        }

                        temp = $fig.attr("data-width");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            json.width = temp;
                        }

                        temp = $fig.attr("data-unused");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            json.defaultUnused = temp;
                        }

                        temp = $fig.attr("data-href");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            json.href = temp;
                        }

                        temp = $fig.attr("data-table");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            json.table = temp;
                        }

                        temp = $fig.attr("data-register");
                        if (temp !== null && temp !== undefined && temp !== "") {
                            json.register = temp;
                        }

                        $("pre.json,div.json,span.json", $fig).each(function() {
                            $.extend(true, json, $.parseJSON(this.textContent));
                            $(this).hide();
                        });

                        if ($fig.hasClass("pcisig_reg") && json.hasOwnProperty("table")) {
                            parsed = { fields: { } };
                            $tbody = $(json.table + " tbody", doc).first();
                            //console.log("pcisig_reg: tbody='" + $tbody.get(0).outerHTML);
                            $tbody.children().each(function() {
                                var $td = $(this).children();
                                if ($td.length >= 3) {
                                    var bits = $td[0].textContent;
                                    var desc = $td[1];
                                    var attr = $td[2].textContent.toLowerCase();
                                    var lsb, msb, match;
                                    lsb = msb = -1;
                                    match = /^\s*(\d+)\s*(:\s*(\d+))?\s*$/.exec(bits);
                                    if (match) {
                                        msb = lsb = Number(match[1]);
                                        if ((typeof(match[3]) === "string") && (match[3] !== "")) {
                                            lsb = Number(match[3]);
                                        }
                                        if (lsb > msb) {
                                            msb = lsb;
                                            lsb = Number(match[1]);
                                        }
                                    }
                                    var fieldName;
                                    var $dfn = $("code:first, dfn:first", desc);
                                    if ($dfn.length === 0) {
                                        fieldName = /^\s*(\w+)/.exec(desc.textContent)[1];
                                    } else {
                                        fieldName = $dfn.first().text().trim();
                                    }
                                    var validAttr = /^(rw|rws|ro|ros|rw1c|rw1cs|rw1s|rw1ss|wo|wos|hardwired|fixed|hwinit|rsvd|rsvdp|rsvdz|reserved|ignored|ign|unused|other)$/i;
                                    if (!validAttr.test(attr)) {
                                        attr = "other";
                                    }
                                    var unusedAttr = /^(rsvd|rsvdp|rsvdz|reserved|ignored|ign|unused)$/i;
                                    var isUnused = !!unusedAttr.test(attr);
//                                    console.log("field: " + fieldName + " bits=\"" + bits + "\"  match=" + match + "\" lsb=" + lsb + " msb=" + msb + "  attr=" + attr + "  isUnused=" + isUnused);
                                    parsed.fields[fieldName] = {
                                        msb:      msb,
                                        lsb:      lsb,
                                        attr:     attr,
                                        isUnused: isUnused
                                    };
                                }
                            });
                            //console.log("parsed=" + JSON.stringify(parsed, null, 2));
                            $.extend(true, json, parsed);
//                            console.log("json=" + JSON.stringify(json, null, 2));
                        }

                        if ($fig.hasClass("nv_refman") && json.hasOwnProperty("href") &&
                            json.hasOwnProperty("register")) {
                            parsed = { fields: { } };
                            pattern = new RegExp("^#\\s*define\\s+(" + json.register +
                                                 ")(\\w*)\\s+(\\S*)\\s*/\\*\\s*(\\S\\S\\S\\S\\S)\\s*\\*/\\s*$");
                            bitpattern = /(\d+):(\d+)/;
                            if (!!conf.ajaxIsLocal) {
                                $.ajaxSetup({ isLocal: true});
                            }
                            conf.ajaxIsLocal = false;
                            $.ajax({
                                       dataType: "text",
                                       url:      json.href,
                                       async:    false,
                                       success:  function(data) {
                                           if (data) {
                                               var lines = data.split(/\n/);
                                               for (var i = 0; i < lines.length; i++) {
                                                   var match = pattern.exec(lines[i]);
                                                   if (match) {
                                                       if (!json.hasOwnProperty("width")) {
                                                           if ((match[2] === "") &&
                                                               (match[4].substr(4, 1) === "R")) {
                                                               var w = match[4].substr(3, 1);
                                                               if (w === "2") {
                                                                   parsed.width = 16;
                                                               } else if (w === "4") {
                                                                   parsed.width = 32;
                                                               } else if (w === "8") {
                                                                   parsed.width = 64;
                                                               } else {
                                                                   parsed.width = 32;
                                                               }
                                                           }
                                                       }
                                                       if ((match[2] !== "") &&
                                                           (match[4].substr(4, 1) === "F")) {
                                                           var bits = bitpattern.exec(match[3]);
                                                           if (bits) {
                                                               parsed.fields[match[1] + match[2]] = {
                                                                   msb:  Number(bits[1]),
                                                                   lsb:  Number(bits[2]),
                                                                   attr: match[4].substr(0, 2)
                                                                             .replace(/[^-r][^-w]/i, "other")
                                                                             .replace(/rw/i, "rw")
                                                                             .replace(/r-/i, "ro")
                                                                             .replace(/-w/i, "wo")};
                                                           } else {
                                                               msg.pub("error",
                                                                       "Unknown field width " + match[0]);
                                                           }
                                                       }
                                                   }
                                               }
                                               //console.log("parsed=" + JSON.stringify(parsed, null, 2));
                                               $.extend(true, json, parsed);
                                               //console.log("json=" + JSON.stringify(json, null, 2));
                                           }
                                       },
                                       error:    function(xhr, status, error) {
                                           msg.pub("error",
                                                   "regpict/nv_refman: Error including file data-href=" +
                                                   json.href +
                                                   " data-register=" + json.register + " : " +
                                                   status + " (" + error + ")");
                                       }
                                   });
                        }

                        // invent a div to hold the svg, if necessary
                        var $divsvg = $("div.svg", this).last();
                        if ($divsvg.length === 0) {
                            var $cap = $("figcaption", this);
                            if ($cap.length > 0) {
                                //console.log("inserting div.svg before <figcaption>");
                                $cap.before('<div class="svg"></div>');
                            } else {
                                //console.log("inserting div.svg at end of <figure>");
                                $(this).append('<div class="svg"></div>');
                            }
                            $divsvg = $("div.svg", this).last();
                        }

                        function merge_json(result, me) {
                            var $me = $(me);
                            var parents = $me.attr("data-parents");
                            if (parents !== null && parents !== undefined && parents !== "") {
                                // console.log("parents = \"" + parents + "\"");
                                parents = parents.split(/\s+/);
                                var i;
                                for (i = 0; i < parents.length; i++) {
                                    var $temp = $("#" + parents[i]);
                                    // console.log("merging: #" + parents[i]);
                                    if ($temp.length > 0) {
                                        // console.log("merge_json: adding \"" + $temp[0].textContent + "\"");
                                        merge_json(result, $temp[0]);
                                        //$.extend(true, result, $.parseJSON($temp[0].textContent));
                                        // console.log("result=" + JSON.stringify(result, null, 2));
                                        $temp.hide();
                                    }
                                }
                            }
                            // console.log("merge_json: adding \"" + me.textContent + "\"");
                            $.extend(true, result, $.parseJSON(me.textContent));
                            // console.log("result=" + JSON.stringify(result, null, 2));
                            $(me).hide();
                        }

                        var $render = $("pre.render,div.render,span.render", $fig);
                        if ($render.length > 0) {
                            $render.each(function(index) {
                                var temp_json = { };
                                $.extend(true, temp_json, json);
                                // console.log("temp_json=" + JSON.stringify(temp_json, null, 2));
                                merge_json(temp_json, this);
                                $(this).hide();
                                $divsvg.last().makeID("svg", "render-" + index);
                                $divsvg.last().svg(function(svg) {
                                    draw_regpict(this, svg, temp_json);
                                });
                                if (index < ($render.length - 1)) {
                                    $divsvg.after('<div class="svg"></div>');
                                    $divsvg = $("div.svg", $fig).last();
                                }
                            });
                        } else if (json !== null) {
                            $divsvg.last().svg(function(svg) {
                                draw_regpict(this, svg, json);
                            });
                        } else {
                            msg.pub("warn",
                                    "core/regpict: no register definition " + $fig.get(0).outerHTML);
                        }
                        msg.pub("end", "core/regpict figure id='" + $fig.attr("id") + "'");
                    });
                msg.pub("end", "core/regpict");
                cb();
            }
        };
    });


// Module core/fix-headers
// Make sure that all h1-h6 headers (that are first direct children of sections) are actually
// numbered at the right depth level. This makes it possible to just use any of them (conventionally
// h2) with the knowledge that the proper depth level will be used

define(
    'core/fix-headers',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/fix-headers");
                var $secs = $("section:not(.introductory)", doc)
                                .find("h1:first, h2:first, h3:first, h4:first, h5:first, h6:first");
                $secs.each(function () {
                    var depth = $(this).parents("section").length + 1;
                    if (depth > 6) depth = 6;
                    var h = "h" + depth;
                    if (this.localName.toLowerCase() !== h) $(this).renameElement(h);
                });
                msg.pub("end", "core/fix-headers");
                cb();
            }
        };
    }
);

/*globals define*/
/*jshint browser:true, jquery:true, laxcomma:true */

// Module core/structure
//  Handles producing the ToC and numbering sections across the document.

// CONFIGURATION:
//  - noTOC: if set to true, no TOC is generated and sections are not numbered
//  - tocIntroductory: if set to true, the introductory material is listed in the TOC
//  - lang: can change the generated text (supported: en, fr)
//  - maxTocLevel: only generate a TOC so many levels deep

define(
    'core/structure',["core/utils"],
    function (utils) {
        "use strict";
        var secMap = {}
        ,   appendixMode = false
        ,   lastNonAppendix = 0
        ,   makeTOCAtLevel = function ($parent, doc, current, level, conf) {
                var $secs = $parent.children(conf.tocIntroductory ? "section" : "section:not(.introductory)");

                if ($secs.length === 0) return null;
                var $ul = $("<ul class='toc'></ul>");
                for (var i = 0; i < $secs.length; i++) {
                    var $sec = $($secs[i], doc)
                    ,   isIntro = $sec.hasClass("introductory")
                    ,   noToc = $sec.hasClass("notoc")
                    ;
                    if (!$sec.children().length || noToc) continue;
                    var h = $sec.children()[0]
                    ,   ln = h.localName.toLowerCase();
                    if (ln !== "h2" && ln !== "h3" && ln !== "h4" && ln !== "h5" && ln !== "h6") continue;
                    var title = h.textContent
                    ,   $kidsHolder = $("<div></div>").append($(h).contents().clone())
                    ;
                    $kidsHolder.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
                    $kidsHolder.find("dfn").renameElement("span").removeAttr("id");
                    var id = h.id ? h.id : $sec.makeID("sect", title);

                    if (!isIntro) current[current.length - 1]++;
                    var secnos = current.slice();
                    if ($sec.hasClass("appendix") && current.length === 1 && !appendixMode) {
                        lastNonAppendix = current[0];
                        appendixMode = true;
                    }
                    if (appendixMode) secnos[0] = utils.appendixMap(current[0] - lastNonAppendix);
                    var secno = secnos.join(".")
                    ,   isTopLevel = secnos.length == 1;
                    if (isTopLevel) {
                        // if this is a top level item, insert
                        // an OddPage comment so html2ps will correctly
                        // paginate the output
                        $(h).before(document.createComment('OddPage'));
                    }
                    $(h).addClass("section-level-" + secnos.length);
                    $(h).wrapInner("<span class='sec-title'></span>");
                    var $span = $("<span class='secno'></span>").text(secno).addClass("section-level-" + secnos.length).append($("<span class='secno-decoration'> </span>"));
                    if (!isIntro) $(h).prepend($span);
                    var map = "";
                    if (!isIntro) {
                        map += "<span class='sec-prefix'>" + (appendixMode ? "Appendix" : (isTopLevel ? "Chapter" : "Section")) + " </span>";
                        map += "<span class='secno secno-level-" + secnos.length + "'>" + secno + "</span>";
                        map += "<span class='sec-decoration'>: </span>";
                    }
                    map += "<span class='sec-title'>" + title + "</span>";
                    secMap[id] = map;
//                    (isIntro ? "" : ("<span class='sec-prefix'>"+ kind + "</span>") +
//                        ("<span class='secno' data-level='" + secnos.length + "'>" + secno + "</span> ")) +
//                        ("<span class='sec-title'>" + title + "</span>");

                    var $a = $("<a/>").attr({ href: "#" + id, 'class' : 'tocxref' })
                                      .append(isIntro ? "" : $span.clone())
                                      .append($("<span class='sectitle'></span>")
                                              .append($kidsHolder.contents()));
                    var $item = $("<li class='tocline'/>").append($a);
                    if (conf.maxTocLevel === 0 || level <= conf.maxTocLevel) {
                        $ul.append($item);
                    }
                    current.push(0);
                    var $sub = makeTOCAtLevel($sec, doc, current, level + 1, conf);
                    if ($sub) $item.append($sub);
                    current.pop();
                }
                return $ul;
            }
        ;

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/structure");
                if (!conf.tocIntroductory) conf.tocIntroductory = false;
                if (!conf.sectionRef) conf.sectionRef = "section #";
                if (!conf.maxTocLevel) conf.maxTocLevel = 0;
                var $secs = $("section:not(.introductory)", doc)
                                .find("h1:first, h2:first, h3:first, h4:first, h5:first, h6:first")
                ,   finish = function () {
                        msg.pub("end", "core/structure");
                        cb();
                    }
                ;
                if (!$secs.length) return finish();
                $secs.each(function () {
                    var depth = $(this).parents("section").length + 1;
                    if (depth > 6) depth = 6;
                    var h = "h" + depth;
                    if (this.localName.toLowerCase() != h) $(this).renameElement(h);
                });

                // makeTOC
                if (!conf.noTOC) {
                    var $ul = makeTOCAtLevel($("body", doc), doc, [0], 1, conf);
                    if (!$ul) return;
                    var $sec = $("<section class='introductory' id='sect-toc'/>").append("<h2>" + conf.l10n.toc + "</h2>")
                                                       .append($ul);
                    var $ref = $("section#sect-toc", doc), replace = false;
                    if ($ref.length) replace = true;
                    if (!$ref.length) $ref = $("#sotd", doc);
                    if (!$ref.length) $ref = $("#abstract", doc);
                    if (replace) {
                        $ref.replaceWith($sec);
                    }
                    else {
                        var $navsec = $("<nav class='introductory' id='toc'/>").append($sec);
                        $ref.after($navsec);
                    }
                }

                // Update all anchors with empty content that reference a section ID
                $("a[href^='#sect']:not(.tocxref)", doc).each(function () {
                    var $a = $(this);
                    if ($a.html() !== "") return;
                    var id = $a.attr("href").slice(1);
                    if (secMap[id]) {
                        $a.addClass("sec-ref");
                        $a.html(secMap[id]);    //($a.hasClass("sectionRef") ? "section " : "") + secMap[id]);
                    } else {
                        var id2 = id.replace("sect-", "h-");
                        // console.log("changing <a href=\"" + id + "\" to \"" + id2 + "\"");
                        if (secMap[id2]) {
                            $a.addClass("sec-ref");
                            $a.html(secMap[id2]);
                            $a.attr("href", "#" + id2);
                        } else {
                            $a.append("<span class=\"respec-error\">" + " {{ Section #" + id + " not found.}} </span>");
                            msg.pub("warn", "Found empty <a> element referencing '" + id + "' but no matching <section>.");
                        }
                    }
                });
                $("a[href^='#h-']:not(.tocxref)", doc).each(function () {
                    var $a = $(this);
                    if ($a.html() !== "") return;
                    var id = $a.attr("href").slice(1);
                    if (secMap[id]) {
                        $a.addClass("sec-ref");
                        $a.html(secMap[id]);    //($a.hasClass("sectionRef") ? "section " : "") + secMap[id]);
                    } else {
                        var id2 = id.replace("h-", "sect-");
                        // console.log("changing <a href=\"" + id + "\" to \"" + id2 + "\"");
                        if (secMap[id2]) {
                            $a.addClass("sec-ref");
                            $a.html(secMap[id2]);
                            $a.attr("href", "#" + id2);
                        } else {
                            $a.append("<span class=\"respec-error\">" + " {{ Section #" + id + " not found.}} </span>");
                            msg.pub("warn", "Found empty <a> element referencing '" + id + "' but no matching <section>.");
                        }
                    }
                });

                finish();
            }
        };
    }
);


// Module w3c/informative
// Mark specific sections as informative, based on CSS

define(
    'w3c/informative',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/informative");
                $("section.informative").find("> h2:first, > h3:first, > h4:first, > h5:first, > h6:first")
                                        .after("<p><em>This section is non-normative.</em></p>");
                msg.pub("end", "core/informative");
                cb();
            }
        };
    }
);


define('tmpl!w3c/templates/permalinks.css', ['handlebars'], function (hb) { return Handlebars.compile('/* --- PERMALINKS --- */\n{{#if permalinkHide}}\nsection > *:hover > span.permalink { visibility: visible; }\n{{/if}}\n\n.permalink {\n    width: 1px;\n    height: 1px;\n    overflow: visible;\n    font-size: 10pt;\n    font-style: normal;\n    vertical-align: middle;\n    margin-left: 4px;\n    {{#if permalinkEdge}}\n\tfloat: right;\n    {{/if}}\n    {{#if permalinkHide}}\n    visibility: hidden;\n    {{/if}}\n}\n\n.permalink a, .permalink a:link, .permalink a:visited, .permalink a:hover, .permalink a:focus, .permalink a:active\n{\n\tbackground:transparent !important;\n\ttext-decoration:none;\n    font-weight: bold;\n\tcolor:#666 !important;\n}\n\n.permalink abbr {\n\tborder:0;\n}\n');});

// Module w3c/permalinks
// Adds "permalinks" into the document at sections with explicit IDs
// Introduced by Shane McCarron (shane@aptest.com) from the W3C PFWG
//
// Only enabled when the includePermalinks option is set to true.
// Defaults to false.
//
// When includePermalinks is enabled, the following options are
// supported:
//
//     permalinkSymbol:    the character(s) to use for the link.
//                         Defaults to §
//     permalinkEdge:      Boolean. The link will be right-justified.  Otherwise
//                         it will be immediately after the heading text.
//                         Defaults to false.
//     permalinkHide:      Boolean. The symbol will be hidden until the header is
//                         hovered over.  Defaults to false.

/*global define, self, respecEvents, respecConfig */



define(
    'w3c/permalinks',["tmpl!w3c/templates/permalinks.css", "core/utils"], // load this to be sure that the jQuery extensions are loaded
    function (css, utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "w3c/permalinks");
                if (conf.includePermalinks) {
                    var symbol = conf.permalinkSymbol || '§';
                    var style = "<style>" + css(conf) + "</style>";

                    $(doc).find("head link").first().before(style);
                    var $secs = $(doc).find("h2, h3, h4, h5, h6");
                    $secs.each(function(i, item) {
                        var $item = $(item);
                        if (!$item.hasClass("nolink")) {
                            var resourceID = $item.attr('id');

                            var $par = $item.parent();
                            if ($par.is("section") || $par.is("div")) {
                                if (!$par.hasClass("introductory") && !$par.hasClass("nolink")) {
                                    resourceID = $par.attr('id');
                                } else {
                                    resourceID = null;
                                }
                            }

                            // if we still have resourceID
                            if (resourceID !== null) {
                                // we have an id.  add a permalink
                                // right after the h* element
                                var theNode = $("<span></span>");
                                theNode.attr('class', 'permalink');
                                if (conf.doRDFa) theNode.attr('typeof', 'bookmark');
                                var ctext = $item.text();
                                var el = $("<a></a>");
                                el.attr({
                                    href:         '#' + resourceID,
                                    'aria-label': 'Permalink for ' + ctext,
                                    title:        'Permalink for ' + ctext });
                                if (conf.doRDFa) el.attr('property', 'url');
                                var sym = $("<span></span>");
                                if (conf.doRDFa) {
                                    sym.attr({
                                        property: 'title',
                                        content:  ctext });
                                }
                                sym.append(symbol);
                                el.append(sym);
                                theNode.append(el);

                                // if this is not being put at
                                // page edge, then separate it
                                // from the heading with a
                                // non-breaking space
                                if (!conf.permalinkEdge) {
                                   $item.append("&nbsp;");
                                }
                                $item.append(theNode);
                            }
                        }
                    });
                }
                msg.pub("end", "w3c/permalinks");
                cb();
            }
        };
    }
);


// Module core/id-headers
// All headings are expected to have an ID, unless their immediate container has one.
// This is currently in core though it comes from a W3C rule. It may move in the future.

define(
    'core/id-headers',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/id-headers");
                $("h2, h3, h4, h5, h6").each(function () {
                    var $h = $(this);
                    if (!$h.attr("id")) {
                        if ($h.parent("section").attr("id") && $h.prev().length === 0) return;
                        $h.makeID();
                    }
                });
                msg.pub("end", "core/id-headers");
                cb();
            }
        };
    }
);


// Module core/rdfa
// Support for RDFa is spread to multiple places in the code, including templates, as needed by
// the HTML being generated in various places. This is for parts that don't fit anywhere in
// particular

define(
    'core/rdfa',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/rdfa");
                if (conf.doRDFa) {
                    $("section").each(function () {
                        var $sec = $(this)
                        ,   resource = ""
                        ,   $fc = $sec.children("h1,h2,h3,h4,h5,h6").first()
                        ,   ref = $sec.attr("id")
                        ,   fcref = null
                        ;
                        if (ref) {
                            resource = "#" + ref;
                        }
                        else if ($fc.length) {
                            ref = $fc.attr("id");
                            if (ref) {
                                resource = "#" + ref;
                                fcref = ref;
                            }
                        }
                        var property = "bibo:hasPart";
                        // Headings on everything but boilerplate
                        if (!resource.match(/#(abstract|sotd|toc)$/)) {
                            $sec.attr({
                                "typeof":   "bibo:Chapter"
                            ,   resource:   resource
                            ,   property:   property
                            });
                        }
                        // create a heading triple too, as per the role spec
                        // since we should not be putting an @role on
                        // h* elements with a value of heading, but we
                        // still want the semantic markup
                        if ($fc.length) {
                            if (!fcref) {
                                // if there is no ID on the heading itself.  Add one
                                fcref = $fc.makeID("h", ref) ;
                            }
                            // set the subject to the ID of the heading
                            $fc.attr({ resource: "#" + fcref }) ;
                            // nest the contents in a span so we can set the predicate
                            // and object
                            $fc.wrapInner( "<span property='xhv:role' resource='xhv:heading'></span>" );
                        }
                    });
                }
                msg.pub("end", "core/rdfa");
                cb();
            }
        };
    }
);

/*globals define*/
/*jshint browser:true, jquery:true, laxcomma:true */

// Module core/structure
//  Handles producing the ToC and numbering sections across the document.

// CONFIGURATION:
//  - noTOC: if set to true, no TOC is generated and sections are not numbered
//  - tocIntroductory: if set to true, the introductory material is listed in the TOC
//  - lang: can change the generated text (supported: en, fr)
//  - maxTocLevel: only generate a TOC so many levels deep

define(
    'core/xref-map',["core/utils"],
    function (utils) {
        "use strict";
        return {
            run: function (conf, doc, cb, msg) {
                msg.pub("start", "core/xref-map");
                if (!!conf.addXrefMap) {
                    var $refs = $("a.tocxref", doc);
                    if ($refs.length > 0) {
                        var $mapsec = $("<section id='xref-map' class='introductory appendix'><h2>Section, Figure, Table, and Equation ID Map</h2></section>").appendTo($("body"));
                        var $tbody = $("<table class='data'><thead><tr><th>Number</th><th>Name</th><th>ID</th></tr></thead><tbody/></table>").appendTo($mapsec).children("tbody");

                        $refs.each(function() {
                            var number = ($(".secno, .figno, .tblno, .eqnno", this).text()
                                          .replace(/ /g,"&nbsp;").replace(/-/g,"&#8209;"));
                            var id = $(this).attr("href");
                            var name = $(".sectitle, .figtitle, .tbltitle, .eqntitle", this).text();
                            $("<tr><td>" + number + "</td>" +
                              "<td class='long'>" + name + "</td>" +
                              "<td class='long'><a href=\"" + id + "\">" + id.substr(1) + "</a></td></tr>").appendTo($tbody);
                        });
                    }
                }
                msg.pub("end", "core/xref-map");
                cb();
            }
        };
    }
);

// Module w3c/aria
// Adds wai-aria landmarks and roles to entire document.
// Introduced by Shane McCarron (shane@aptest.com) from the W3C PFWG

define(
    'w3c/aria',["core/utils"], // load this to be sure that the jQuery extensions are loaded
    function (utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "w3c/aria");
                // ensure all headers after sections have
                // headings and aria-level
                var $secs = $("section", doc)
                                .find("h1:first, h2:first, h3:first, h4:first, h5:first, h6:first");
                $secs.each(function(i, item) {
                    var $item = $(item)
                    ,   resourceID = $item.parent('section[id]').attr('id')
                    ,   level = $item.parents("section").length ;

                    $item.attr('aria-level', level);
                    $item.attr('role', 'heading') ;
                    if (!$item.attr("id")) {
                        $item.attr('id', $item.prop('tagName').toLowerCase() + '_' + resourceID) ;
                    }
                });
                // ensure head section is labelled
                $('body', doc).attr('role', 'document') ;
                $('body', doc).attr('id', 'respecDocument') ;
                $('div.head', doc).attr('role', 'contentinfo') ;
                $('div.head', doc).attr('id', 'respecHeader') ;
                if (!conf.noTOC) {
                    // ensure toc is labelled
                    var toc = conf.useExperimentalStyles ? $('nav#toc', doc).find("ul:first") : $('section#toc', doc).find("ul:first");
                    toc.attr('role', 'directory') ;
                }
                // mark issues and notes with heading
                var noteCount = 0 ; var issueCount = 0 ; var ednoteCount = 0;
                $(".note-title, .ednote-title, .issue-title", doc).each(function (i, item) {
                    var $item = $(item)
                    ,   isIssue = $item.hasClass("issue-title")
                    ,   isEdNote = $item.hasClass("ednote-title")
                    ,   level = $item.parents("section").length+2 ;

                    $item.attr('aria-level', level) ;
                    $item.attr('role', 'heading') ;
                    if (isIssue) {
                        issueCount++;
                        $item.makeID('h', "issue" + issueCount) ;
                    } else if (isEdNote) {
                        ednoteCount++;
                        $item.makeID('h', "ednote" + ednoteCount) ;
                    } else {
                        noteCount++;
                        $item.makeID('h', "note" + noteCount) ;
                    }
                });
                msg.pub("end", "w3c/aria");
                cb();
            }
        };
    }
);


// Module core/shiv
// Injects the HTML5 shiv conditional comment

define(
    'core/shiv',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/shiv");
                var cmt = doc.createComment("[if lt IE 9]><script src='https://www.w3.org/2008/site/js/html5shiv.js'></script><![endif]");
                $("head").append(cmt);
                msg.pub("end", "core/shiv");
                cb();
            }
        };
    }
);


// Module core/remove-respec
// Removes all ReSpec artefacts right before processing ends

define(
    'core/remove-respec',["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/remove-respec");
                // it is likely that some asynch operations won't have completed at that moment
                // if they happen to need the artefacts, we could change this to be hooked into
                // the base-runner to run right before end-all
                utils.removeReSpec(doc);
                msg.pub("end", "core/remove-respec");
                cb();
            }
        };
    }
);


// Module core/location-hash
// Resets window.location.hash to jump to the right point in the document

define(
    'core/location-hash',[],
    function () {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/location-hash");
                var hash = window.location.hash;

                // Number of pixels that the document has already been
                // scrolled vertically (cross-browser)
                var scrollY = (window.pageYOffset !== undefined)
                    ? window.pageYOffset
                    : (document.documentElement || document.body.parentNode || document.body).scrollTop;

                // Only scroll to the hash if the document hasn't been scrolled yet
                // this ensures that a page refresh maintains the scroll position
                if (hash && !scrollY) {
                    window.location.hash = "";
                    window.location.hash = hash;
                }
                msg.pub("end", "core/location-hash");
                cb();
            }
        };
    }
);

/*global define, respecVersion, require */
/*jshint laxcomma:true, browser:true */

// this is only set in a build, not at all in the dev environment
var requireConfig = {
    shim:   {
        shortcut: {
            exports:    "shortcut"
        }
    }
};
if ("respecVersion" in window && respecVersion) {
    requireConfig.paths = {
        "ui":   "https://sglaser.github.io/respec/js/ui"
//      "ui":   "file:///Users/sglaser/Repositories/PCISIG/respec-sglaser/js/ui"
    };
}
require.config(requireConfig);

define('profile-pcisig-common',[
            "domReady"
        ,   "core/base-runner"
        ,   "core/ui"
        ,   "core/include-config"
        ,   "core/override-configuration"
        ,   "core/default-root-attr"
        ,   "w3c/l10n"
        ,   "core/markdown"
        ,   "core/style"
        ,   "pcisig/style"
        ,   "pcisig/headers"
        ,   "core/footnotes"
        ,   "w3c/abstract"
        ,   "pcisig/conformance"
        ,   "core/data-transform"
        ,   "core/data-include"
        ,   "core/inlines"
        ,   "core/dfn"
        ,   "w3c/rfc2119"
        ,   "core/examples"
        ,   "core/issues-notes"
        ,   "core/requirements"
        ,   "core/highlight"
        ,   "core/best-practices"
        ,   "core/figures"
        ,   "core/tables"
        ,   "core/equations"
        ,   "core/biblio"
        ,   "core/webidl-contiguous"
        ,   "core/webidl-oldschool"
        ,   "core/contrib"
        ,   "core/regpict"
        ,   "core/fix-headers"
        ,   "core/structure"
        ,   "w3c/informative"
        ,   "w3c/permalinks"
        ,   "core/id-headers"
        ,   "core/rdfa"
        ,   "core/xref-map"
        ,   "w3c/aria"
        ,   "core/shiv"
        ,   "core/remove-respec"
        ,   "core/location-hash"
        ],
        function (domReady, runner, ui) {
            var args = Array.prototype.slice.call(arguments);
            domReady(function () {
                ui.addCommand("Save Snapshot", "ui/save-html", "Ctrl+Shift+Alt+S");
                ui.addCommand("About ReSpec", "ui/about-respec", "Ctrl+Shift+Alt+A");
                ui.addCommand("Definition List", "ui/dfn-list", "Ctrl+Shift+Alt+D");
                ui.addCommand("Search Specref DB", "ui/search-specref", "Ctrl+Shift+Alt+space");
                runner.runAll(args);
            });
        }
);


require(['profile-pcisig-common']);
