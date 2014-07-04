/* jshint browser: true */
/* jshint jquery: true */
/* global define */
// Module core/dfn
// Handles the processing and linking of <dfn> and <a> elements.
define(
    [],
    function() {
        "use strict";
        var dfnClass = ["dfn", "pin", "signal", "op", "opcode", "operation", "request", "reply", "message", "msg",
                        "command", "term", "field", "register", "regpict", "state", "value", "parameter", "argument"];
        return {
            run: function(conf, doc, cb, msg) {
                msg.pub("start", "core/dfn");
                doc.normalize();
                if (!conf.definitionMap) {
                    conf.definitionMap = {};
                }
                if (!conf.definitionHTML) {
                    conf.definitionHTML = {};
                }
                $("dfn", doc).each(function() {
                    var tag = dfnClass[0];  // default "dfn"
                    for (var i = 1; i < dfnClass.length; i++) {
                        if ($(this).hasClass(dfnClass[i])) {
                            tag = dfnClass[i];
                        }
                    }
                    var title = $(this).dfnTitle();
                    if (conf.definitionMap[tag + "-" + title]) {
                        msg.pub("error", "Duplicate definition '" + tag + "-" + title + "'");
                        $(this).append("<span class=\"respec-error\"> Definition '" + tag + "-" + title + "' is defined more than once </span>");
                    }
                    conf.definitionMap[tag + "-" + title] = $(this).makeID(tag, title);
                    conf.definitionHTML[tag + "-" + title] = $(this).html();
                });
                $("div.hasSVG g[id]", doc).each(function() {
                    //console.log("svg g[id] matches " + this.outerHTML);
                    var $text = $("text.regFieldName", this).first();
                    if ($text) {
                        var title = $text.dfnTitle();
                        if (!conf.definitionMap["regpict-" + title]) {
                            conf.definitionMap["regpict-" + title] = $(this).attr("id");
                            conf.definitionHTML["regpict-" + title] = $text.text();
                        }
                        if (("field-" + title) in conf.definitionMap) {
                            $text.wrap("<a xlink:href=\"field-" + title + "></a>");
                            $text = $("text.regFieldValue", this);
                            if ($text.length > 0) {
                                $text.wrap("<a xlink:href=\"field-" + title + "></a>");
                            }
                        }
                    }
                });
                $("a:not([href])", doc).each(function() {
                    var $ant = $(this);
                    if ($ant.hasClass("externalDFN")) {
                        return;
                    }
                    var title = $ant.dfnTitle();
                    var tag = null;
                    for (var i = 0; i < dfnClass.length; i++) {
                        if (conf.definitionMap[dfnClass[i] + "-" + title]) {
                            if ($ant.hasClass(dfnClass[i])) {
                                tag = dfnClass[i];
                            } else if (!(conf.definitionMap[dfnClass[i] + "-" + title] instanceof Function)) {
                                if (tag === null) {
                                    tag = dfnClass[i];
                                } else if (!$ant.hasClass(tag)) {
                                    tag = tag + "-" + dfnClass[i];
                                }
                            }
                        }
                    }
                    if (tag !== null) {
                        if (tag === "regpict-field" || tag === "field-regpict") {
                            tag = "field";
                        }
                        if (conf.definitionMap[tag + "-" + title]) {
                            $ant.attr("href",
                                      "#" + conf.definitionMap[tag + "-" + title]).addClass("internalDFN").addClass(tag);
                            if (conf.definitionHTML[tag + "-" + title] && !$ant.attr("title")) {
                                $ant.html(conf.definitionHTML[tag + "-" + title]);
                            }
                        } else {
                            var temp = tag.split("-")[0] + "-" + title;
                            $ant.attr("href", "#" + temp);
                            if (conf.definitionHTML[tag + "-" + title] && !$ant.attr("title")) {
                                $ant.html(conf.definitionHTML[tag + "-" + title]);
                            }
                            temp = "Ambiguous reference to '" + tag + "-" + title + "', resolved as '" + temp + "'";
                            msg.pub("warn", temp);
                            $ant.append("<span class=\"respec-error\"> " + temp + " </span>");
                        }

                    }
                    else {
                        // ignore WebIDL
                        if (!$ant.parents(".idl, dl.methods, dl.attributes, dl.constants, dl.constructors, dl.fields, dl.dictionary-members, span.idlMemberType, span.idlTypedefType, div.idlImplementsDesc").length) {
                            msg.pub("warn",
                                    "Found linkless <a> element with text '" + title + "' but no matching <dfn>.");
                        }
                        $ant.replaceWith($ant.contents());
                    }
                });
                if (conf.addDefinitionMap) {
                    msg.pub("start", "core/dfn/addDefinitionMap");
                    var $mapsec = $("<section id='definition-map' class='introductory appendix'><h2>Definition Map</h2></section>").appendTo($("body"));
                    var $tbody = $("<table><thead><tr><th>Kind</th><th>Name</th><th>ID</th><th>HTML</th></tr></thead><tbody/></table>").appendTo($mapsec).children("tbody");
                    var keys = Object.keys(conf.definitionMap).sort();
                    for (var i = 0; i < keys.length; i++) {
                        var d = keys[i];
                        var item = d.split(/-/);
                        var kind = item.shift();
                        var id = conf.definitionMap[d];
                        $("<tr><td>" + kind + "</td><td>" + item.join("-") + "</td><td><a href=\"" + "#" + id + "\">" + id + "</a></td><td>" + conf.definitionHTML[d] + "</td></tr>").appendTo($tbody);
                    }
                    msg.pub("end", "core/dfn/addDefinitionMap");
                }
                msg.pub("end", "core/dfn");
                cb();
            }
        };
    }
);
