// Module pcisig/fig-tbl-eqn-numbering
// Find figure numbers and adjust them to include the chapter number.
// Edit the Table of Figures as well.
// This happens as a distinct pass for two reasons:
// 1. core/figures runs before core/structure and thus doesn't know Chapter and Appendix numbers
// 2. A second pass means that this plugin is not part of the src/core.

import {pub} from "core/pubsubhub";

export const name = "pcisig/fig-tbl-eqn-numbering";

export function run(conf, doc, cb) {
  if (conf.numberByChapter) {
    var $secs = $("body > section[data-sectno]", doc);
    var figNumMap = new Map();
    var tblNumMap = new Map();
    var eqnNumMap = new Map();
    for (var i = 0; i < $secs.length; i++) {
      var $sec = $($secs[i], doc);
      var first;

      // Process Figure Captions, populating figNumMap
      first = 0;
      $("figcaption > span.figno", $sec).each(function () {
          var $figno_elem = $(this);
          var figno = parseInt($figno_elem.text(), 10);
          if (first === 0) first = figno;
          var new_figno = $sec["data-secno"] + "-" + (figno - first + 1);
          figNumMap.set(figno, new_figno);
          $figno_elem.text(new_figno);
        }
      );

      // Process Table Captions, populating tblNumMap
      first = 0;
      $("caption > span.tblno", $sec).each(function () {
          var $tblno_elem = $(this);
          var tblno = parseInt($tblno_elem.text(), 10);
          if (first === 0) firstTbl = figno;
          var new_tblno = $sec["data-secno"] + "-" + (tblno - first + 1);
          tblNumMap.set(tblno, new_tblno);
          $tblno_elem.text(new_tblno);
        }
      );

      // Process Eqnure Captions, populating eqnNumMap
      first = 0;
      $("figcaption > span.eqnno", $sec).each(function () {
          var $eqnno_elem = $(this);
          var eqnno = parseInt($eqnno_elem.text(), 10);
          if (first === 0) first = eqnno;
          var new_eqnno = $sec["data-secno"] + "-" + (eqnno - first + 1);
          eqnNumMap.set(eqnno, new_eqnno);
          $eqnno_elem.text(new_eqnno);
        }
      );
    }

    // Convert Figure References using figNumMap
    $("a.fig-ref > span.figno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (figNumMap.has(old_num)) {
        $(this).text(figNumMap.get(old_num));
      }
    });
    // Convert List of Figures using figNumMap
    $("li.tofline > a.tocxref > span.figno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (figNumMap.has(old_num)) {
        $(this).text(figNumMap.get(old_num));
      }
    });

    // Convert Table References using tblNumMap
    $("a.tbl-ref > span.tblno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (tblNumMap.has(old_num)) {
        $(this).text(tblNumMap.get(old_num));
      }
    });
    // Convert List of Tables using tblNumMap
    $("li.totline > a.tocxref > span.tblno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (tblNumMap.has(old_num)) {
        $(this).text(tblNumMap.get(old_num));
      }
    });

    // Convert Equation References using eqnNumMap
    $("a.eqn-ref > span.eqnno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (eqnNumMap.has(old_num)) {
        $(this).text(eqnNumMap.get(old_num));
      }
    });
    // Convert List of Equations using eqnNumMap
    $("li.toeline > a.tocxref > span.eqnno", doc).each(function () {
      var old_num = parseInt($(this).text(), 10);
      if (eqnNumMap.has(old_num)) {
        $(this).text(eqnNumMap.get(old_num));
      }
    });
  }
  cb();
}
