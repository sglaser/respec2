/*globals define*/

// Module core/equation
// Handles equations in the document. This encompasses enablling the generation of a
// Table of Equations wherever there is a #toe or #sect-toe element to be found.
// This also normalizes equation titles.

define(
    ["core/utils"],
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
