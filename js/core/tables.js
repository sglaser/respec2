/*globals define */

// Module core/table
// Handles tables in the document. This enables enable the generation of a Table of Tables wherever there is a #tot element
// to be found as well as normalise the titles of tables.

define(
    ["core/utils"],
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
                if (!conf.tblFmt) conf.tblFmt = "";//Table %(%1%c-%#%): %t";
                //conf.tblFmt = "";

                // process all tables
                var tblMap = {}, tot =[ ], num = [1,1], appendixMode = false, lastNonAppendix = -1000;
                var $secs = $("body", doc).children(conf.tocIntroductory ? "section" : "section:not(.introductory):not(#toc):not(#tof):not(#tot):not(#sect-toc):not(#sect-tof):not(#sect-tot)");
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
                
                // Create a Table of Tables if a section with id 'tot' exists.
                var $tot = $("#tot", doc);
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
