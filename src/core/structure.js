// Module core/structure
//  Handles producing the ToC and numbering sections across the document.

// LIMITATION:
//  At this point we don't support having more than 26 appendices.
// CONFIGURATION:
//  - noTOC: if set to true, no TOC is generated and sections are not numbered
//  - tocIntroductory: if set to true, the introductory material is listed in the TOC
//  - lang: can change the generated text (supported: en, fr)
//  - maxTocLevel: only generate a TOC so many levels deep

let secMap = {};
let appendixMode = false;
let lastNonAppendix = 0;
let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const name = "core/structure";

function makeTOCAtLevel($parent, doc, current, level, conf) {
  let $secs = $parent.children(
    conf.tocIntroductory ? "section" : "section:not(.introductory)"
  );
  if ($secs.length === 0) {
    return null;
  }
  let $ol = $("<ol class='toc'></ol>");
  for (let i = 0; i < $secs.length; i++) {
    let $sec = $($secs[i], doc);
    let isIntro = $sec.hasClass("introductory");
    let noToc = $sec.hasClass("notoc");
    if (!$sec.children().length || noToc) {
      continue;
    }
    let h = $sec.children()[0],
      ln = h.localName.toLowerCase();
    if (
      ln !== "h2" &&
      ln !== "h3" &&
      ln !== "h4" &&
      ln !== "h5" &&
      ln !== "h6"
    ) {
      continue;
    }
    let $kidsHolder = $("<div></div>").append($(h).contents().clone());
    $kidsHolder.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
    $kidsHolder.find("dfn").renameElement("span");
    $kidsHolder.find("[id]").removeAttr("id");
    $kidsHolder.find("span.footnote").remove();
    $kidsHolder.find("span.issue").remove();
    $kidsHolder.find("span.respec-error").remove();
    $kidsHolder.find("span.noToc").remove();
    let title = $kidsHolder[0].textContent;
    let id = h.id ? h.id : $sec.makeID("sect", title);

    if (!isIntro) {
      current[current.length - 1]++;
    }
    let secnos = current.slice();
    if ($sec.hasClass("appendix") && current.length === 1 && !appendixMode) {
      lastNonAppendix = current[0];
      appendixMode = true;
    }
    if (appendixMode) {
      secnos[0] = alphabet.charAt(current[0] - lastNonAppendix);
    }
    let secno = secnos.join("."),
      bareSecno = secno,                  // secno without the trailing '.' at the top level
      isTopLevel = secnos.length === 1;
    if (!isIntro) {
      $sec.attr({"data-secno": secno});   // Note: before adding "." to top level section numbers
    }
    if (isTopLevel) {
      secno = secno + ".";
      // if this is a top level item, insert
      // an OddPage comment so html2ps will correctly
      // paginate the output
      $(h).before(document.createComment("OddPage"));
    }
    let $span = $("<span class='secno'></span>").text(secno + " ");
    if (!isIntro) {
      $(h).prepend($span);
    }
    let $kidsClone = $kidsHolder.clone();
    $kidsClone.wrapInner($("<span class='sec-title'/>"));
    let secType = (isTopLevel ? (appendixMode ? conf.l10n.appendix : conf.l10n.chapter) : conf.l10n.section);
    if (!isIntro) {
      $kidsClone.prepend($("<span class='sec-title-decoration'> </span>"))
        .prepend($("<span class='secno'>" + bareSecno + "</span>"))
        .prepend($("<span class='sec-secno-decoration'>" + secType + " </span>"));
    }
    secMap[id] = $kidsClone.contents();
    let $a = $("<a/>")
      .attr({ href: "#" + id, class: "tocxref" })
      .append(isIntro ? "" : $span.clone())
      .append($kidsHolder.contents());
    let $item = $("<li class='tocline'/>").append($a);
    if (conf.maxTocLevel === 0 || level <= conf.maxTocLevel) $ol.append($item);
    current.push(0);
    let $sub = makeTOCAtLevel($sec, doc, current, level + 1, conf);
    if ($sub) {
      $item.append($sub);
    }
    current.pop();
  }
  return $ol;
}

export function run(conf, doc, cb) {
  if ("tocIntroductory" in conf === false) {
    conf.tocIntroductory = false;
  }
  if ("maxTocLevel" in conf === false) {
    conf.maxTocLevel = 0;
  }
  let $secs = $("section:not(.introductory)", doc)
    .find("h1:first, h2:first, h3:first, h4:first, h5:first, h6:first")
    .toArray()
    .filter(elem => elem.closest("section.introductory") === null);
  $secs = $($secs);
  if (!$secs.length) {
    return cb();
  }
  $secs.each(function() {
    let depth = $(this).parents("section").length + 1;
    if (depth > 6) depth = 6;
    let h = "h" + depth;
    if (this.localName.toLowerCase() !== h) $(this).renameElement(h);
  });

  // makeTOC
  if (!conf.noTOC) {
    let $ol = makeTOCAtLevel($("body", doc), doc, [0], 1, conf);
    if (!$ol) return;
    let nav = doc.createElement("nav");
    nav.id = "toc";
    nav.innerHTML = "<h2 class='introductory'>" + conf.l10n.toc + "</h2>";
    nav.appendChild($ol[0]);
    let $ref = $("#toc", doc);
    let replace = false;
    if ($ref.length) {
      replace = true;
    }
    if (!$ref.length) {
      $ref = $("#sotd", doc);
    }
    if (!$ref.length) {
      $ref = $("#abstract", doc);
    }
    if (replace) {
      $ref.replaceWith(nav);
    } else {
      $ref.after(nav);
    }

    let $link = $(
      "<p role='navigation' id='back-to-top'><a href='#toc'><abbr title='Back to Top'>&uarr;</abbr></a></p>"
    );
    $("body").append($link);
  }

  // Update all anchors with empty content that reference a section ID
  $("a[href^='#']:not(.tocxref)", doc).each(function() {
    let $a = $(this),
      id = $a.attr("href");
    if (!id) return;
    id = id.substring(1);
    if (secMap[id]) {
      $a.addClass("sec-ref");
      if ($a.html() === "") {
        let ref = secMap[id].clone();
        ref.find("a").renameElement("span").attr("class", "formerLink").removeAttr("href");
        ref.find("dfn").renameElement("span");
        ref.find("[id]").removeAttr("id");
        ref.find("span.footnote").remove();   // footnotes are in the caption, not references
        ref.find("span.issue").remove();      // issues are in the caption, not references
        ref.find("span.respec-error").remove(); // errors are in the caption, not references
        ref.find("span.noToc").remove();      // explicitly not in refs
        $a.append(ref);
      }
    }
  });

  cb();
}
