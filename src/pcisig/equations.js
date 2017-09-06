// Module core/equation
// Handles equations in the document. This encompasses two primary operations. One is
// converting some old syntax to use the new HTML5 equation and figcaption elements
// (this is undone by the unhtml5 plugin, but that will soon be phased out). The other
// is to enable the generation of a Table of Equations wherever there is a #toe element
// to be found as well as normalise the titles of equations.

import { pub } from "core/pubsubhub";

export const name = "core/equations";

export function run(conf, doc, cb) {
  // process all equations
  var eqnMap = {},
    toe = [],
    num = 0;
  $("figure.equation").each(function() {
    var $eqn = $(this),
      $cap = $eqn.find("figcaption"),
      tit = $cap.text(),
      id = $eqn.makeID("eqn", tit);

    // set proper caption title
    num++;
    $cap
      .wrapInner($("<span class='eqn-title'/>"))
      .prepend(doc.createTextNode(" "))
      .prepend($("<span class='eqnno'>" + num + "</span>"))
      .prepend(doc.createTextNode(conf.l10n.eqn));
    eqnMap[id] = $cap.contents();
    var $toeCap = $cap.clone();
    $toeCap.find("a").renameElement("span").removeAttr("href");
    $toeCap.find("span.footnote").remove();   // footnotes are in the caption, not #toe
    $toeCap.find("span.issue").remove();      // issues are in the caption, not #toe
    toe.push(
      $("<li class='toeline'><a class='tocxref' href='#" + id + "'></a></li>")
        .find(".tocxref")
        .append($toeCap.contents())
        .end()
    );
  });

  // Update all anchors with empty content that reference a equation ID
  $("a[href]", doc).each(function() {
    var $a = $(this),
      id = $a.attr("href");
    if (!id) return;
    id = id.substring(1);
    if (eqnMap[id]) {
      $a.addClass("eqn-ref");
      if ($a.html() === "") $a.append(eqnMap[id].clone());
    }
  });

  // Create a Table of Equations if a section with id 'toe' exists.
  var $toe = $("#toe", doc);
  if (toe.length && $toe.length) {
    // if it has a parent section, don't touch it
    // if it has a class of appendix or introductory, don't touch it
    // if all the preceding section siblings are introductory, make it introductory
    // if there is a preceding section sibling which is an appendix, make it appendix
    if (
      !$toe.hasClass("appendix") &&
      !$toe.hasClass("introductory") &&
      !$toe.parents("section").length
    ) {
      if (
        $toe.prevAll("section.introductory").length ===
        $toe.prevAll("section").length
      ) {
        $toe.addClass("introductory");
      } else if ($toe.prevAll("appendix").length) {
        $toe.addClass("appendix");
      }
    }
    $toe.append($("<h2>" + conf.l10n.table_of_eqn + "</h2>"));
    $toe.append($("<ul class='toe'/>"));
    var $ul = $toe.find("ul");
    while (toe.length) $ul.append(toe.shift());
  }
  cb();
}
