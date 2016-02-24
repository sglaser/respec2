/* jshint browser: true */
/* jshint jquery: true */
/* global define */

// Module core/dfn
// Finds all <dfn> elements and populates conf.definitionMap to identify them.
define(
    [],
    function () {
        "use strict";
        var dfnClass = ["dfn", "pin", "signal", "op", "opcode", "operation", "request", "response",
                        "reply", "message", "msg",  "command", "term", "field", "register",
                        "regpict", "state", "value", "parameter", "argument"];
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/dfn");
                doc.normalize();
                $("[dfn-for]").each(function() {
                    this.setAttribute("data-dfn-for", this.getAttribute("dfn-for").toLowerCase());
                    this.removeAttribute("dfn-for");
                });
                if (!conf.definitionMap)  conf.definitionMap = {};

                //msg.pub("warn", "dfn done with part 1\n");

                $("dfn", doc).each(function() {
                    //console.log("before: " + this.outerHTML);
                    var $dfn = $(this);
                    if ($dfn.attr("for")) {
                        $dfn.attr("data-dfn-for", $dfn.attr("for").toLowerCase());
                        $dfn.removeAttr("for");
                    } else if ($dfn.hasClass("field") && ($dfn.parents("table[id]").length == 1)) {
                        $dfn.attr("data-dfn-for", ($dfn.parents("table[id]").attr("id").replace(/^tbl-/,"") || ""));
                    } else {
                        var $closest = $dfn.closest("[data-dfn-for]");
                        if ($closest.length > 0) {
                            $dfn.attr("data-dfn-for", ($closest.attr("data-dfn-for")).toLowerCase());
                        }
                    }
                    var tag = dfnClass[0];  // default "dfn"
                    dfnClass.forEach(function(t) { if ($dfn.hasClass(t)) tag = t; });
                    $dfn.attr("data-dfn-type", tag);
                    //console.log("middle: " + this.outerHTML);
                    var id = $dfn.makeID(tag);
                    var titles = $dfn.getDfnTitles( { isDefinition: true } );
                    //msg.pub("warn", "titles.length = " + titles.length + "  titles=\"" + titles.join("|||") + "\"");
                    titles.forEach( function( item ) {
                        if (!conf.definitionMap[item]) {
                            conf.definitionMap[item] = [];
                        }
                        conf.definitionMap[item].push(id);
                        if (conf.definitionMap[tag + "-" + item]) {
                            //msg.pub("error", "Duplicate definition '" + tag + "-" + item + "'");
                            $dfn.append("<span class=\"respec-error\"> {{ Definition '" + tag + "-" + item + "' is defined more than once. }} </span>");
                        }
                        if (!conf.definitionMap[tag + "-" + item]) {
                            conf.definitionMap[tag + "-" + item] = [];
                        }
                        conf.definitionMap[tag + "-" + item].push(id);
                    });
                    //console.log(" after: " + this.outerHTML);
                });

                //msg.pub("warn", "dfn done with part 2\n");

                $("div.hasSVG g[id]", doc).each(function() {
                    var $text = $("text.regFieldName", this).first();
                    if ($text) {
                        var title = $text.dfnTitle();
                        var id = $(this).attr("id");
                        //msg.pub("warn", "<dfn class=\"regpict\" id=\"" + id + "\">" + $(this).text() + "</dfn>");
                        conf.definitionMap[id] = id;
                        var found = null;
                        for (i = 0; i < title.length; i++) {
                            //msg.pub("warn", "<dfn" + i + " class=\"regpict\" title=\"regpict-" + title[i] + "\">" + $(this).text() + "</dfn>");
                            conf.definitionMap["regpict-" + title[i]] = id;
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
                            //msg.pub("warn", "Map[field-" + title + "]=" + conf.definitionMap["field-" + title]);
                            //msg.pub("warn", " $rect.length= " + $rect.length);
                            //msg.pub("warn", " $rect[0] is " + $rect[0]);
                            //msg.pub("warn", " wrapping field-" + title);
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

                //msg.pub("warn", "dfn done with part 3\n");

                $("dfn.field", doc).each(function() {
                    var id = this.id.replace(/^field-/,"#regpict-");
                    if (id !== this.id) {
                        //msg.pub("warn", "field-->regpict: looking for " + this.id + " --> " + id);
                        var $regpict = $(id, doc);
                        if ($regpict.length > 0) {
                            var $regfig = $regpict.parents("figure[id]");
                            if ($regfig.length > 0) {
                                $(this).wrapInner("<a href=\"#" + $regfig.attr("id") + "\"></a>");
                                //msg.pub("warn", "field-->regpict: <dfn class=\"" + this["class"] +
                                // "\" id=\"" + $regfig("id") + "\">" + $(this).html() + "</dfn>");
                                //msg.pub("warn", "");
                            }
                        }
                    }
                });

                //msg.pub("warn", "dfn done with part 4\n");

                $("a:not([href]):not([tabindex])", doc)
                    .filter(
                    function() {
                        return (this.getAttributeNodeNS("http://www.w3.org/1999/xlink", "href") === null);
                    })
                    .each(
                    function() {
                        //msg.pub("warn", "a:not([href]): " + this.tagName + "  " + this.namespaceURI + "  " + this.outerHTML);
                        var $ant = $(this);
                        if ($ant.hasClass("externalDFN")) {
                            return;
                        }
                        /*var hrefNode = this.getAttributeNodeNS("http://www.w3.org/1999/xlink", "href");
                         if (hrefNode) {
                         msg.pub("warn", "  getAttributeNS() localName=" + hrefNode.localName +
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
                            //msg.pub("warn", "class=" + temp);
                            temp = temp.split(/\s+/);
                            for (i = 0; i < temp.length; i++) {
                                //msg.pub("warn", "checking " + temp[i] + "-" + title);
                                if (conf.definitionMap[temp[i] + "-" + title]) {
                                    tag = temp[i];
                                    //msg.pub("warn", "found " + temp[i] + "-" + title);
                                }
                            }
                        }
                        if (tag === null) {
                            dfnClass.forEach(function(t) {
                                if (conf.definitionMap[t + "-" + title]) {
                                    if (tag === null) {
                                        tag = t;
                                    } else {
                                        tag = tag + "-" + t;
                                    }
                                }
                            });
                        }
                        if (tag !== null) {
                            //msg.pub("warn", "tag= " + tag);
                            if (tag === "regpict-field" || tag === "field-regpict") {
                                tag = "field";
                            }
                            //msg.pub("warn", "tag= " + tag);
                            var warn = null;
                            if (tag.match(/-/)) {
                                warn = "Ambiguous reference to '(" + tag + ")-" + title + "'";
                                tag = tag.split("-")[0];
                                warn = warn + ", resolved as '" + tag + "'";
                                //msg.pub("warn", "warn", warn);
                            }
                            //$ant.attr("href", "#" + conf.definitionMap[tag + "-" + title][0].attr("id"))
                            $ant.attr("href", "#" + conf.definitionMap[tag + "-" + title])
                                .addClass("internalDFN")
                                .addClass(tag);
                            if (warn !== null) {
                                $ant.append("<span class=\"respec-error\"> {{ " + warn + " }} </span>");
                            }
                            //msg.pub("warn", "result: " + $ant[0].outerHTML);
                        }
                        else {
                            // ignore WebIDL
                            if (!$ant.parents(".idl, dl.methods, dl.attributes, dl.constants, dl.constructors, dl.fields, dl.dictionary-members, span.idlMemberType, span.idlTypedefType, div.idlImplementsDesc").length) {
                                //msg.pub("warn",
                                //"Found linkless <a> element with text '" + title + "' but no matching <dfn>.");
                            }
                            $ant.replaceWith($ant.contents());
                        }
                    }
                );

                if (conf.addDefinitionMap) {
                    msg.pub("start", "core/dfn/addDefinitionMap");
                    var $mapsec = $("<section id='definition-map' class='introductory appendix'><h2>Definition Map</h2></section>").appendTo($("body"));
                    var $tbody = $("<table class='data'><thead><tr><th>Kind</th><th>Name</th><th>ID</th></tr></thead><tbody/></table>").appendTo($mapsec).children("tbody");
                    var keys = Object.keys(conf.definitionMap).sort();
                    keys.forEach(function(k) {
                        var ksplit = k.split(/-/);
                        var kind = ksplit.shift();
                        var id = conf.definitionMap[k];
                        if (dfnClass.indexOf(kind) >= 0) {
                            $("<tr>" +
                              "<td class='long'>" + kind + "</td>" +
                              "<td class='long'>" + ksplit.join('-') + "</td>" +
                              "<td class='long'><a href=\"" + "#" + id + "\">" + id + "</a></td>" +
                              "</tr>").appendTo($tbody);
                        }
                    });
                    msg.pub("end", "core/dfn/addDefinitionMap");
                }
                msg.pub("end", "core/dfn");
                cb();
            }
        };
    }
);
