/*globals define*/

// Module core/figure
// Handles figures in the document. This encompasses two primary operations. One is
// converting some old syntax to use the new HTML5 figure and figcaption elements
// (this is undone by the unhtml5 plugin, but that will soon be phased out). The other
// is to enable the generation of a Table of Figures wherever there is a #tof element
// to be found as well as normalise the titles of figures.

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
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/figures");
                if (!conf.figFmt) conf.figFmt = conf.l10n.fig + "%(%#%) %t"; //"%1Figure %(%c-%#%): %t";

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
                var $secs = $("body", doc).children(conf.tocIntroductory ? "section" : "section:not(.introductory):not(#toc):not(#tof):not(#tot):not(#sect-toc):not(#sect-tof):not(#sect-tot)");
				for (var i = 0; i < $secs.length; i++) {
					var $sec = $($secs[i], doc);
                    if ($sec.hasClass("appendix") && !appendixMode) {
                        lastNonAppendix = i;
                        appendixMode = true;
                    }
                    var chapter = i + 1;
                    if (appendixMode) chapter = utils.appendixMap(i - lastNonAppendix);
                    $("figure", $sec).each(function () {
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

                // Create a Table of Figures if a section with id 'tof' exists.
                var $tof = $("#tof", doc);
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
