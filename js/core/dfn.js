
// Module core/dfn
// Handles the processing and linking of <dfn> and <a> elements.
define(
    [],
    function () {
        var dfnClass = ["dfn", "pin", "signal", "term", "field", "register", "state", "value", "parameter", "argument"];
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/dfn");
                doc.normalize();
                if (!conf.definitionMap) conf.definitionMap = {};
                if (!conf.definitionHTML) conf.definitionHTML = {};
                $("dfn").each(function () {
                    var tag = dfnClass[0];  // default "dfn"
                    for (var i = 1; i < dfnClass.length; i++) {
                        if ($(this).hasClass(dfnClass[i])) tag = dfnClass[i];
                    }
                    var title = $(this).dfnTitle();
                    if (conf.definitionMap[tag + "-" + title]) {
                        msg.pub("error", "Duplicate definition '" + tag + "-" + title + "'");
                        $(this).append("<span class=\"respec-error\"> Duplicate definition of '" + tag + "-" + title + "'</span>");
                    }
                    conf.definitionMap[tag + "-" + title] = $(this).makeID(tag, title);
                    conf.definitionHTML[tag + "-" + title] = $(this).html();
                });
                $("svg text[id]").each(function () {
                    //console.log("svg text[id] matches " + this.outerHTML);
                    var title = $(this).dfnTitle();
                    if (!conf.definitionMap["field-" + title]) {
                        conf.definitionMap["field-" + title] = $(this).attr("id");
                    }
                });
                $("a:not([href])").each(function () {
                    var $ant = $(this);
                    if ($ant.hasClass("externalDFN")) return;
                    var title = $ant.dfnTitle();
                    var tag = null;
                    for (var i = 0; i < dfnClass.length; i++) {
                        if (conf.definitionMap[dfnClass[i] + "-" + title]) {
                            if ($ant.hasClass(dfnClass[i])) {
                                tag = dfnClass[i];
                            }
                            else if (!(conf.definitionMap[dfnClass[i] + "-" + title] instanceof Function)) {
                                if (tag == null) {
                                    tag = dfnClass[i];
                                }
                                else if (!$ant.hasClass(tag)) {
                                    tag = tag + "-" + dfnClass[i];
                                }
                            }
                        }
                    }
                    if (tag != null) {
                        if (conf.definitionMap[tag + "-" + title]) {
                            $ant.attr("href", "#" + conf.definitionMap[tag + "-" + title]).addClass("internalDFN").addClass(tag);
                            if (conf.definitionHTML[tag + "-" + title] && !$ant.attr("title"))
                                $ant.html(conf.definitionHTML[tag + "-" + title]);
                        } else {
                            $ant.attr("href", "#" + conf.definitionMap[tag.split("-")[0] + "-" + title]);
                            var temp = "Ambiguous reference to '" + tag + "-" + title + "'";
                            msg.pub("warn", temp);
                            $ant.append("<span class=\"respec-error\"> " + temp + " </span>");
                        }

                    }
                    else {
                        // ignore WebIDL
                        if (!$ant.parents(".idl, dl.methods, dl.attributes, dl.constants, dl.constructors, dl.fields, dl.dictionary-members, span.idlMemberType, span.idlTypedefType, div.idlImplementsDesc").length) {
                            msg.pub("warn", "Found linkless <a> element with text '" + title + "' but no matching <dfn>.");
                        }
                        $ant.replaceWith($ant.contents());
                    }
                });
                msg.pub("end", "core/dfn");
                cb();
            }
        };
    }
);
