// Module core/table
// Handles tables in the document.
// This is to enable the generation of a Table of Tables wherever there is a #tot element
// to be found as well as normalise the titles of tables.

import {pub} from "core/pubsubhub";

export const name = "core/tables";

export function run(conf, doc, cb) {

  // process all tables
  var tblMap = {},
    tot = [],
    num = 0;
  $("table").each(function () {
    var $tbl = $(this),
      $cap = $tbl.find("caption"),
      tit = $cap.text(),
      id = $tbl.makeID("tbl", tit);

    // set proper caption title
    num++;
    $cap
      .wrapInner($("<span class='tbl-title'/>"))
      .prepend(doc.createTextNode(" "))
      .prepend($("<span class='tblno'>" + num + "</span>"))
      .prepend(doc.createTextNode(conf.l10n.tbl));
    tblMap[id] = $cap.contents();
    var $totCap = $cap.clone();
    $totCap.find("a").renameElement("span").removeAttr("href");
    $totCap.find("span.footnote").remove();   // footnotes are in the caption, not #tot
    $totCap.find("span.issue").remove();      // issues are in the caption, not #tot
    tot.push(
      $("<li class='totline'><a class='tocxref' href='#" + id + "'></a></li>")
        .find(".tocxref")
        .append($totCap.contents())
        .end()
    );
  });

  // Update all anchors with empty content that reference a table ID
  $("a[href]", doc).each(function () {
    var $a = $(this),
      id = $a.attr("href");
    if (!id) return;
    id = id.substring(1);
    if (tblMap[id]) {
      $a.addClass("tbl-ref");
      if ($a.html() === "") $a.append(tblMap[id].clone());
    }
  });

  // Create a Table of Tables if a section with id 'tot' exists.
  var $tot = $("#tot", doc);
  if (tot.length && $tot.length) {
    // if it has a parent section, don't touch it
    // if it has a class of appendix or introductory, don't touch it
    // if all the preceding section siblings are introductory, make it introductory
    // if there is a preceding section sibling which is an appendix, make it appendix
    if (
      !$tot.hasClass("appendix") &&
      !$tot.hasClass("introductory") &&
      !$tot.parents("section").length
    ) {
      if (
        $tot.prevAll("section.introductory").length ===
        $tot.prevAll("section").length
      ) {
        $tot.addClass("introductory");
      } else if ($tot.prevAll("appendix").length) {
        $tot.addClass("appendix");
      }
    }
    $tot.append($("<h2>" + conf.l10n.table_of_tbl + "</h2>"));
    $tot.append($("<ul class='tot'/>"));
    var $ul = $tot.find("ul");
    while (tot.length) $ul.append(tot.shift());
  }
  cb();
}
