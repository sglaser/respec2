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
    ["core/utils"],
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
