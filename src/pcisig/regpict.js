/*globals define */
/*jslint plusplus:true, white:true, vars:true, regexp:true, nomen:true */
/*jshint jquery:true, browser:true, funcscope:true, laxbreak:true, laxcomma:true */

// Module pcisig/regpict
// Handles register pictures in the document. This encompasses two primary operations. One is
// extracting register information from a variety of table styles. The other is inventing an
// svg diagram that represents the fields in the table.


import {pub} from "core/pubsubhub";
import "deps/jquery";
import "deps/jquery.svg";
import css from "deps/text!pcisig/css/regpict.css";

export const name = "pcisig/regpict";

function pget(obj, prop, def) {
  if ((obj !== null) && obj.hasOwnProperty(prop)) {
    return obj[prop];
  }
  return def;
}

function choose_defaults(reg) {
  let json = {};
  json.width = Number(pget(reg, "width", 32));
  json.left_to_right = Boolean(pget(reg, "leftToRight", false));
  json.forceFit = Boolean(pget(reg, "forceFit", false));
  json.debug = Boolean(pget(reg, "debug", false));
  json.defaultUnused = String(pget(reg, "defaultUnused", "RsvdP"));
  json.defaultAttr = String(pget(reg, "defaultAttr", "other"));
  json.cellWidth = Number(pget(reg, "cellWidth", 16));
  json.cellHeight = Number(pget(reg, "cellHeight", 32));
  json.cellInternalHeight = Number(pget(reg, "cellInternalHeight", 8));
  json.cellValueTop = Number(pget(reg, "cellValueTop", 20)); // top of text for regFieldValueInternal
  json.cellBitValueTop = Number(pget(reg, "cellBitValueTop", 20)); // top of text for regFieldBitValue
  json.cellNameTop = Number(pget(reg, "cellNameTop", 16)); // top of text for regFieldNameInternal
  json.bracketHeight = Number(pget(reg, "bracketHeight", 4));
  json.cellTop = Number(pget(reg, "cellTop", 40));
  json.bitWidthPos = Number(pget(reg, "bitWidthPos", 20));
  json.figName = String(pget(reg, "figName", "???"));
  json.maxFigWidth = Number(pget(reg, "maxFigWidth", 624));   // 6.5 inches (assuming 96 px per inch)
  json.figLeft = Number(pget(reg, "figLeft", 40));
  json.visibleLSB = Number(pget(reg, "visibleLSB", 0));
  json.visibleMSB = Number(pget(reg, "visibleMSB", json.width));
  json.fields = pget(reg, "fields", {}); // default to empty register
  let temp;

  if (json.visibleMSB < 0) {
    json.visibleMSB = 0;
  }
  if (json.visibleMSB > json.width) {
    json.visibleMSB = json.width;
  }
  if (json.visibleLSB < 0) {
    json.visibleLSB = 0;
  }
  if (json.visibleLSB > json.width) {
    json.visibleLSB = json.width;
  }
  //console.log("choose_defaults: width=" + json.width + " defaultUnused ='" + json.defaultUnused + "' cellWidth=" + json.cellWidth + " cellHeight=" + json.cellHeight + " cellInternalHeight=" + json.cellInternalHeight + " cellTop=" + json.cellTop + " bracketHeight=" + json.bracketHeight);
  //console.log("choose_defaults: fields=" + json.fields.toString());

  // sanitize field array to avoid subsequent problems
  for (let index in json.fields) {
    if (json.fields.hasOwnProperty(index)) {
      let item = json.fields[index];
      if (item.hasOwnProperty("msb") && !item.hasOwnProperty("lsb")) {
        item.lsb = item.msb;
      }
      if (item.hasOwnProperty("lsb") && !item.hasOwnProperty("msb")) {
        item.msb = item.lsb;
      }
      if (item.msb < item.lsb) {
        temp = item.lsb;
        item.lsb = item.msb;
        item.msb = temp;
      }
      if (!item.hasOwnProperty("isUnused")) {
        item.isUnused = false;
      }
      if (!item.hasOwnProperty("attr")) {
        item.attr = json.defaultAttr;
      }
      if (!item.hasOwnProperty("name")) {
        item.name = index;
      }
      if (!item.hasOwnProperty("value")) {
        item.value = "";
      }
      if (!item.hasOwnProperty("index")) {
        item.index = -1;  // no associated table row
      }
      json.fields[index] = item;
      //console.log("choose_defaults: field msb=" + item.msb + " lsb=" + item.lsb + " attr=" + item.attr + " isUnused=" + item.isUnused + " name='" + item.name + "' index=" + item.index);
    }
  }
  return json;
}

function draw_regpict(divsvg, svg, reg) {
  let reg2 = choose_defaults(reg);
  let width = reg2.width;
  //console.log("width=" + reg2.width);
  let left_to_right = reg2.left_to_right;
  let forceFit = reg2.forceFit;
  let debug = reg2.debug;
  let defaultUnused = reg2.defaultUnused;
  //let defaultAttr = reg2.defaultAttr;
  let cellWidth = reg2.cellWidth;
  let cellHeight = reg2.cellHeight;
  let cellInternalHeight = reg2.cellInternalHeight;
  let cellValueTop = reg2.cellValueTop;
  let cellBitValueTop = reg2.cellBitValueTop;
  let cellNameTop = reg2.cellNameTop;
  let bracketHeight = reg2.bracketHeight;
  let cellTop = reg2.cellTop;
  let bitWidthPos = reg2.bitWidthPos;
  let figName = reg2.figName;
  let maxFigWidth = reg2.maxFigWidth;
  let figLeft = reg2.figLeft;
  let visibleLSB = reg2.visibleLSB;
  let visibleMSB = reg2.visibleMSB;
  let fields = reg2.fields;

  let bitarray = [];  // Array indexed by bit # in register range 0:width
  // field[bitarray[N]] contains bit N
  // bitarray[N] == null for unused bits
  // bitarray[N] == 1000 for first bit outside register width

  let i, j;
  bitarray[width] = 1000; //???
  for (i = 0; i < width; i++) {
    bitarray[i] = null;
  }

  for (let index in fields) {
    if (fields.hasOwnProperty(index)) {
      for (i = fields[index].lsb; i <= fields[index].msb; i++) {
        bitarray[i] = index;
      }
    }
  }

  let lsb = -1;   // if >= 0, contains bit# of lsb of a string of unused bits
  for (i = 0; i <= width; ++i) {  // note: includes bitarray[width]
    if (lsb >= 0 && bitarray[i] !== null) {
      // first "used" bit after stretch of unused bits, invent an "unused" field
      let index = "_unused_" + (i - 1); // _unused_msb
      if (lsb !== (i - 1)) {
        index = index + "_" + lsb;  // _unused_msb_lsb
      }
      fields[index] = {
        "msb": (i - 1),
        "lsb": lsb,
        // "name": ((i - lsb) * 2 - 1) >= defaultUnused.length ? defaultUnused : defaultUnused[0].toUpperCase(), // use full name if if fits, else use 1st char
        "name": defaultUnused,
        "attr": defaultUnused.toLowerCase(),   // attribute is name
        "isUnused": true,
        "value": ""
      };
      for (j = lsb; j < i; j++) {
        bitarray[j] = index;
      }
      lsb = -1;
    }
    if (lsb < 0 && bitarray[i] === null) {
      // starting a string of unused bits
      lsb = i;
    }
  }

  function max(a, b) {
    return (a > b ? a : b);
  }

  function min(a, b) {
    return (a < b ? a : b);
  }

  // x position of left edge of bit i
  function leftOf(i) {
    let ret;
    let adj_bit = i;
    if (i >= 0) {
      if (i > visibleMSB) {
        adj_bit = visibleMSB;
      }
      if (i < visibleLSB) {
        adj_bit = visibleLSB;
      }
      if (left_to_right) {
        adj_bit = adj_bit - visibleLSB;
      } else {
        adj_bit = visibleMSB - adj_bit;
      }
    } else { // negative bit #, always to the right
      adj_bit = visibleMSB - visibleLSB - i - 0.5;
    }
    ret = figLeft + cellWidth * (adj_bit - 0.5);
    if (debug) {
       console.log(i + " leftOf   left_to_right=" + left_to_right +
        " figLeft=" + figLeft +
        " cellWidth=" + cellWidth +
        " visibleLSB=" + visibleLSB +
        " visibleMSB=" + visibleMSB +
        " adj_bit=" + adj_bit +
        "\t--> ret=" + ret);
    }
    return ret;
  }

  // x position of right edge of bit i
  function rightOf(i) {
    let ret;
    let adj_bit = i;
    if (i >= 0) {
      if (i > visibleMSB) {
        adj_bit = visibleMSB;
      }
      if (i < visibleLSB) {
        adj_bit = visibleLSB;
      }
      if (left_to_right) {
        adj_bit = adj_bit - visibleLSB;
      } else {
        adj_bit = visibleMSB - adj_bit;
      }
    } else { // negative bit #, always to the right
      adj_bit = visibleMSB - visibleLSB - i - 0.5;
    }
    ret = figLeft + cellWidth * (adj_bit + 0.5);
    if (debug) {
       console.log(i + " rightOf  left_to_right=" + left_to_right +
        " figLeft=" + figLeft +
        " cellWidth=" + cellWidth +
        " visibleLSB=" + visibleLSB +
        " visibleMSB=" + visibleMSB +
        " adj_bit=" + adj_bit +
        "\t--> ret=" + ret);
    }
    return ret;
  }

  // x position of middle of bit i
  function middleOf(i) {
    let ret;
    let adj_bit = i;
    if (i >= 0) {
      if (i > visibleMSB) {
        adj_bit = visibleMSB;
      }
      if (i < visibleLSB) {
        adj_bit = visibleLSB;
      }
      if (left_to_right) {
        adj_bit = adj_bit - visibleLSB;
      } else {
        adj_bit = visibleMSB - adj_bit;
      }
    } else { // negative bit #, always to the right
      adj_bit = visibleMSB - visibleLSB - i - 0.5;
    }
    ret = figLeft + cellWidth * (adj_bit);
    if (debug) {
       console.log(i + " middleOf left_to_right=" + left_to_right +
        " figLeft=" + figLeft +
        " cellWidth=" + cellWidth +
        " visibleLSB=" + visibleLSB +
        " visibleMSB=" + visibleMSB +
        " adj_bit=" + adj_bit +
        "\t--> ret=" + ret);
    }
    return ret;
  }

  if (debug) {
    console.log(" forceFit=" + forceFit +
                " left_to_right=" + left_to_right);
  }

  let g, p, f, text;
  let nextBitLine = cellTop + cellHeight + 20; //76;
  let bitLineCount = 0;
  let max_text_width = 0;

  for (let b2 = 0; b2 < width; b2++) {
    let b = (left_to_right ? width - b2 - 1 : b2);
    for (i in fields) {
      if (fields.hasOwnProperty(i)) {
        f = fields[i];
        let gAddClass = ["regFieldInternal", "regAttr_" + f.attr, "regLink"];
        if (b === f.lsb) {
          g = svg.group();
          //let bitnum_width;
          if (f.lsb === f.msb) {
            text = svg.text(g, middleOf(f.lsb), cellTop - 4,
              svg.createText().string(f.lsb), {
                "class_": "regBitNumMiddle"
              });
            if (debug) {
              console.log("bitnum-middle " + f.lsb + " at x=" + middleOf(f.lsb) + " y=" + (cellTop - 4));
            }
            /*bitnum_width = text.clientWidth;
            if (bitnum_width === 0) {
                // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                bitnum_width = String(f.lsb).length * 4; // Assume 4px per character on average
            }
            if ((bitnum_width + 2) > cellWidth) {
                svg.change(text,
                           {
                               x: middleOf(f.lsb),
                               y: cellTop,
                               transform: "rotate(270, " +
                                          middleOf(f.lsb) + ", " +
                                          (cellTop - 4) + ")",
                               "class_": "regBitNumStart"
                           });
                console.log("bitnum-middle " + f.lsb + " at x=" + middleOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
            }*/
          } else {
            let pos;
            let cls;
            let str;
            if (f.lsb < visibleLSB) {
              if (left_to_right) {
                gAddClass.push("regFieldOverflowMSB");
                str = f.lsb + " ... " + visibleLSB;
                pos = rightOf(f.lsb) - 2;
                cls = "regBitNumEnd";
              } else {
                gAddClass.push("regFieldOverflowLSB");
                str = visibleLSB + " ... " + f.lsb;
                pos = leftOf(f.lsb) + 2;
                cls = "regBitNumStart";
              }
            } else {
              str = f.lsb;
              if (left_to_right) {
                pos = leftOf(f.lsb) + 2;
                cls = "regBitNumStart";
              } else {
                pos = rightOf(f.lsb) - 2;
                cls = "regBitNumEnd";
              }
            }
            text = svg.text(g, pos, cellTop - 4,
              svg.createText().string(str), {"class_": cls});
            if (debug) {
              console.log("bitnum-lsb " + f.lsb + " at x=" + pos + " y=" + (cellTop - 4) + " left_to_right=" + left_to_right);
            }
            /*bitnum_width = text.clientWidth;
            if (bitnum_width === 0) {
                // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                bitnum_width = String(f.lsb).length * 4; // Assume 4px per character on average
            }
            if ((bitnum_width + 2) > ((leftOf(f.msb) - rightOf(f.lsb)) / 2)) {
                 svg.change(text,
                           {
                               x: middleOf(f.lsb),
                               y: cellTop,
                               transform: "rotate(270, " +
                                          rightOf(f.lsb) + ", " +
                                          (cellTop - 4) + ")",
                               "class_": "regBitNumStart"
                           });
                console.log("bitnum-right " + f.lsb + " at x=" + rightOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
            }*/
            if (f.msb > visibleMSB) {
              if (left_to_right) {
                gAddClass.push("regFieldOverflowLSB");
                str = visibleMSB + " ... " + f.msb;
                pos = leftOf(f.msb) + 2;
                cls = "regBitNumStart";
              } else {
                gAddClass.push("regFieldOverflowMSB");
                str = f.msb + " ... " + visibleMSB;
                pos = rightOf(f.msb) - 2;
                cls = "regBitNumEnd";
              }
            } else {
              str = f.msb;
              if (left_to_right) {
                pos = rightOf(f.msb) - 2;
                cls = "regBitNumEnd";
              } else {
                pos = leftOf(f.msb) + 2;
                cls = "regBitNumStart";
              }
            }
            text = svg.text(g, pos, cellTop - 4,
              svg.createText().string(str), {"class_": cls});
            if (debug) {
              console.log("bitnum-msb " + f.msb + " at x=" + pos + " y=" + (cellTop - 4) + " left_to_right=" + left_to_right);
            }
            /*bitnum_width = text.clientWidth;
            if (bitnum_width === 0) {
                // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
                bitnum_width = String(f.msb).length * 4; // Assume 4px per character on average
            }
            if ((bitnum_width + 2) > ((leftOf(f.msb) - rightOf(f.lsb)) / 2)) {
                svg.change(text,
                           {
                               x: middleOf(f.msb),
                               y: cellTop,
                               transform: "rotate(270, " +
                                          leftOf(f.msb) + ", " +
                                          (cellTop - 4) + ")",
                               "class_": "regBitNumStart"
                           });
                console.log("bitnum-left " + f.lsb + " at x=" + leftOf(f.lsb) + " y=" + (cellTop - 4) + " rotate=270");
            }*/
          }
          if (f.lsb >= visibleLSB) {
            let pos = (left_to_right ? leftOf(f.lsb) : rightOf(f.lsb));
            svg.line(g,
              pos, cellTop,
              pos, cellTop - (text.clientHeight * 0.75),
              {"class_": (f.lsb === visibleLSB) ? "regBitNumLine" : "regBitNumLine_Hide"});
          }
          if (f.msb <= visibleMSB) {
            let pos = (left_to_right ? rightOf(f.msb) : leftOf(f.msb));
            svg.line(g,
              pos, cellTop,
              pos, cellTop - (text.clientHeight * 0.75),
              {"class_": "regBitNumLine"});
          }
          if (f.hasOwnProperty("addClass") && typeof f.addClass === "string") {
            gAddClass = gAddClass.concat(f.addClass.split(/\s+/));
          }
          if (f.isUnused) {
            gAddClass.push("regFieldUnused");
          }
          let wid;
          let pos;
          if (left_to_right) {
            pos = leftOf(f.lsb);
            wid = rightOf(f.msb) - pos;
          } else {
            pos = leftOf(f.msb);
            wid = rightOf(f.lsb) - pos;
          }
          svg.rect(g, pos, cellTop, wid, cellHeight, 0, 0,
            {"class_": "regFieldBox"});
          for (j = f.lsb + 1; j <= f.msb; j++) {
            if ((j >= visibleLSB) && (j <= visibleMSB)) {
              let pos = (left_to_right ? leftOf(j) : rightOf(j));
              svg.line(g,
                pos, cellTop + cellHeight - cellInternalHeight,
                pos, cellTop + cellHeight,
                {"class_": "regFieldBox"});
            }
          }
          text = svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop - bitWidthPos,
            svg.createText().string((f.msb === f.lsb)
              ? "1 bit"
              : (f.msb - f.lsb + 1) + " bits"),
            {"class_": "regBitWidth"});
          text = svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop + cellNameTop,
            svg.createText().string(f.name),
            {"class_": "regFieldName"});
          if ((!f.isUnused) && (f.lsb <= visibleMSB) && (f.msb >= visibleLSB)) {
            let $temp_dom = $("<span></span>").prependTo(divsvg);
            let unique_id = $temp_dom.makeID("regpict", (f.id ? f.id : (figName + "-" + f.name)));
            $temp_dom.remove();
            svg.change(g, {id: unique_id});
          }
          if (f.value !== "") {
            if (Array.isArray(f.value) && f.value.length === (f.msb - f.lsb + 1)) {
              for (i = 0; i < f.value.length; ++i) {
                svg.text(g, (leftOf(f.lsb + i) + rightOf(f.lsb + i)) / 2,
                  cellTop + cellBitValueTop,
                  svg.createText().string(f.value[i]),
                  {
                    "class_": ("regFieldValue regFieldBitValue" +
                      " regFieldBitValue-" + i.toString() +
                      ((i === (f.value.length - 1)) ?
                        " regFieldBitValue-msb" : ""))
                  });
              }
            } else if ((typeof(f.value) === "string") || (f.value instanceof String)) {
              svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2,
                cellTop + (f.msb === f.lsb ? cellBitValueTop : cellValueTop),
                svg.createText().string(f.value),
                {"class_": "regFieldValue"});
            } else {
              svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, cellTop + cellValueTop,
                svg.createText().string("INVALID VALUE"),
                {"class_": "svg_error"});
            }
          }
          let text_width = text.clientWidth;
          if (text_width === 0) {
            // bogus fix to guess width when clientWidth is 0 (e.g. IE10)
            text_width = f.name.length * 8; // Assume 8px per character on average for 15px height chars
          }
          if (text_width > max_text_width) {
            max_text_width = text_width;
          }
          let text_height = text.clientHeight;
          if (text_height === 0) {
            // bogus fix to guess width when clientHeight is 0 (e.g. IE10)
            text_height = 18;             // Assume 18px: 1 row of text, 15px high
          }
          let boxLeft = leftOf(left_to_right ? max(visibleLSB, f.lsb) : min(visibleMSB, f.msb));
          let boxRight = rightOf(left_to_right ? min(visibleMSB, f.msb) : max(visibleLSB, f.lsb));
          if (debug) {
            console.log("field " + f.name +
              " msb=" + f.msb +
              " lsb=" + f.lsb +
              " attr=" + f.attr +
              " isUnused=" + f.isUnused +
              (("id" in f) ? f.id : ""));
             console.log(" text.clientWidth=" + text.clientWidth +
              " text_width=" + text_width +
              " text.clientHeight=" + text.clientHeight +
              " text_height=" + text_height +
              " boxLeft=" + boxLeft +
              " boxRight=" + boxRight +
              " boxWidth=" + (boxRight - boxLeft));
          }
          /* if field has a specified value,
           the field name is too wide for the box,
           or the field name is too tall for the box */
          if ((f.lsb > visibleMSB) || (f.msb < visibleLSB)) {
            gAddClass[0] = "regFieldHidden";
          } else {
            if (!forceFit && ((f.value !== "") ||
              ((text_width + 2) > (boxRight - boxLeft)) ||
              ((text_height + 2) > (cellHeight - cellInternalHeight)))) {
              svg.change(text,
                {
                  x: rightOf(-0.5),
                  y: nextBitLine,
                  "class_": "regFieldName"
                });
              p = svg.createPath();
              p.move(boxLeft, cellTop + cellHeight);
              p.line(((boxRight - boxLeft) / 2), bracketHeight, true);
              p.line(boxRight, cellTop + cellHeight);
              svg.path(g, p,
                {
                  "class_": "regBitBracket",
                  fill: "none"
                });
              p = svg.createPath();
              p.move((boxLeft + (boxRight - boxLeft) / 2), cellTop + cellHeight + bracketHeight);
              p.vert(nextBitLine - text_height / 4);
              p.horiz(rightOf(-0.4));
              svg.path(g, p,
                {
                  "class_": "regBitLine",
                  fill: "none"
                });
              gAddClass[0] = "regFieldExternal";
              gAddClass.push("regFieldExternal" + (bitLineCount < 2 ? "0" : "1"));
              nextBitLine += text_height + 2;
              bitLineCount = (bitLineCount + 1) % 4;
            }
          }
          if ((f.msb > visibleLSB) && (f.lsb < visibleLSB)) {
            if (left_to_right) {
              svg.text(g, leftOf(0) - 2, cellTop + cellNameTop,
                svg.createText().string("..."),
                {"class_": "regFieldExtendsLeft"});
            } else {
              svg.text(g, rightOf(0) + 2, cellTop + cellNameTop,
                svg.createText().string("..."),
                {"class_": "regFieldExtendsRight"});
            }
          }
          if ((f.msb > visibleMSB) && (f.lsb < visibleMSB)) {
            if (left_to_right) {
              svg.text(g, rightOf(f.msb) + 2, cellTop + cellNameTop,
                svg.createText().string("..."),
                {"class_": "regFieldExtendsRight"});
            } else {
              svg.text(g, leftOf(f.msb) - 2, cellTop + cellNameTop,
                svg.createText().string("..."),
                {"class_": "regFieldExtendsLeft"});
            }
          }
          svg.change(g, {"class_": gAddClass.join(" ")});
        }
      }
    }
  }
  let scale = 1.0;
  max_text_width = max_text_width + rightOf(-1);
  if ((maxFigWidth > 0) && (max_text_width > maxFigWidth)) {
    scale = maxFigWidth / max_text_width;
  }
  svg.configure({
    height: Math.ceil((scale * nextBitLine)) + "",
    width: Math.ceil((scale * max_text_width)) + "",
    viewBox: "0 0 " + max_text_width + " " + nextBitLine,
    "xmlns:xlink": "http://www.w3.org/1999/xlink"
  });
  return reg2;
}

function insert_unused_table_rows($tbl, json) {
  let last_lsb = json.width;
  let field_slot = [];
  let $tbody = $("tbody", $tbl).first();
  if ($tbody !== undefined) {
    //console.log("non-empty tbody");
    let rows = $tbody.children();
    if (rows !== undefined) {
      //console.log("rows.length=" + rows.length);
      //console.log("json=" + JSON.stringify(json, null, 2));
      // console.log(`Object.keys(json.fields).length=${Object.keys(json.fields).length}`);
      if (Object.keys(json.fields).length > 0) {
        Object.keys(json.fields).forEach(function (name) {
          let item = json.fields[name];
          // console.log(`field_slot[${item.msb}]=${JSON.stringify(item, null, 2)}`);
          field_slot[item.msb] = item;
        });
        for (let msb = json.width; msb >= 0; msb--) {
          let item = field_slot[msb];
          if (item !== undefined) {
            // console.log(`msb=${msb} item.index=${item.index} last_lsb=${last_lsb}`);
            if (msb < (last_lsb - 1)) {
              let bit_location = ((last_lsb - 1) === msb) ? `${msb + 1}` : `${last_lsb - 1}:${msb + 1}`;
              let new_row = `<tr><td>${bit_location}</td><td>${json.defaultUnused}</td><td>${json.defaultUnused}</td></tr>`;
              $(rows[item.index]).after(new_row);
              // console.log(`rows[${item.index}].after(${new_row})`);
            }
            last_lsb = item.lsb;
          }
        }
      }
      if (last_lsb > 0) {
        let bit_location = ((last_lsb - 1) === 1) ? "0" : `${last_lsb - 1}:0`;
        let new_row = `<tr><td>${bit_location}</td><td>${json.defaultUnused}</td><td>${json.defaultUnused}</td></tr>`;
        $(rows[0]).before(new_row);
        // console.log(`rows[0].before(${new_row})`);
        // console.log("$tbody=" + $tbody);
      }
    } else {
      let bit_location = ((last_lsb - 1) === 1) ? "0" : `${last_lsb - 1}:0`;
      let new_row = `<tr><td>${bit_location}</td><td>${json.defaultUnused}</td><td>${json.defaultUnused}</td></tr>`;
      $tbody.append(new_row);
      // console.log(`$tbody.append(${new_row})`);
    }
  }
}

function parse_table(json, $tbl) {
  let parsed = {fields: {}};
  let $tbody = $("tbody", $tbl).first();
  //console.log("pcisig_reg: tbody='" + $tbody.get(0).outerHTML);
  $tbody.children().each(function (index) {
    let $td = $(this).children();
    if ($td.length >= 3) {
      let bits = $td[0].textContent.trim();
      let desc = $td[1];
      let attr = $td[2].textContent.toLowerCase().trim();
      let lsb, msb, match;
      lsb = msb = -1;
      match = /^\s*(\d+)\s*(:\s*(\d+))?\s*$/.exec(bits);
      if (match) {
        msb = lsb = Number(match[1]);
        if ((typeof(match[3]) === "string") && (match[3] !== "")) {
          lsb = Number(match[3]);
        }
        if (lsb > msb) {
          msb = lsb;
          lsb = Number(match[1]);
        }
      }
      let fieldName;
      let $dfn = $("dfn:first", desc);
      if ($dfn.length === 0) {
        fieldName = /^\s*([-_\w]+)/.exec(desc.textContent);
        if (fieldName) {
          fieldName = fieldName[1]; // first word of text content
        } else {
          fieldName = "Bogus_" + desc.textContent.trim();
        }
      } else {
        $dfn = $dfn.first();
        fieldName = $dfn.text().trim();
        $dfn.addClass('field');
        const lt = $tbl.attr("id").replace(/^tbl-/, '');
        $dfn.attr('data-dfn-for', lt);
        $dfn.attr('data-dfn-type', 'field');
        $dfn.last().makeID('field', lt + '-' + fieldName.toLowerCase());
      }
      let $val = $("span.value:first", desc);
      let value = "";
      if ($val.length === 1) {
        try {
          value = JSON.parse($val.text().trim());
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid data-json attribute in next span.value</p>p>");
          $val.addclass("respec-error");
        }
      }
      let validAttr = /^(rw|rws|ro|ros|rw1c|rw1cs|rw1s|rw1ss|wo|wos|hardwired|fixed|hwinit|rsvd|rsvdp|rsvdz|reserved|ignored|ign|unused|other)$/i;
      if (!validAttr.test(attr)) {
        attr = "other";
      }
      let unusedAttr = /^(rsvd|rsvdp|rsvdz|reserved|ignored|ign|unused)$/i;
      let isUnused = !!unusedAttr.test(attr);
      // console.log("field: " + fieldName + " bits=\"" + bits + "\"  match=" + match + "\" lsb=" + lsb + " msb=" + msb + "  attr=" + attr + "  isUnused=" + isUnused);
      parsed.fields[fieldName] = {
        index: index,
        msb: msb,
        lsb: lsb,
        attr: attr,
        isUnused: isUnused,
        value: value
      };
    }
  });
  // console.log("parsed=" + JSON.stringify(parsed, null, 2));
  $.extend(true, json, parsed);
  // console.log("json=" + JSON.stringify(json, null, 2));
  return json;
}

export function run(conf, doc, cb) {

  pub("start", "core/regpict");
  if (!(conf.noRegpictCSS)) {
    $(doc).find("head link").first().before($("<style id=\"regpict\"></style>").text(css));
  }
  let figNum = 1;
  $("figure.regipct-generated", doc).remove();
  $("table.register", doc).each(function () {
    let $tbl = $(this);
    let json = {};
    if ($tbl.attr("id")) {
      json.figName = $tbl.attr("id").replace(/^tbl-/, "");
    } else if ($tbl.attr("title")) {
      json.figName = $tbl.attr("title");
    } else if ($("caption", this)) {
      json.figName = $("caption", this).text();
    } else {
      json.figName = "unnamed-" + figNum;
      figNum++;
    }
    json.figName = json.figName.toLowerCase()
      .replace(/^\s+/, "")
      .replace(/\s+$/, "")
      .replace(/[^\-.0-9a-z_]+/ig, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .replace(/\.$/, ".x")
      .replace(/^([^a-z])/i, "x$1")
      .replace(/^$/, "generatedID");
    if (!$tbl.attr("id")) {
      $tbl.attr("id", "tbl-" + json.figName);
    }
    pub("start", "core/regpict table id='" + $tbl.attr("id") + "'");
    let temp = $tbl.attr("data-json");
    if (temp !== null && temp !== undefined && temp !== "") {
      let temp2 = {};
      try {
        temp2 = JSON.parse(temp);
        $.extend(true, json, temp2);
      } catch (e) {
        $tbl.before("<p class=\"issue\">Invalid data-json attribute in next table</p>");
        $tbl.addclass("respec-error");
      }
    }

    temp = $tbl.attr("data-width");
    if (temp !== null && temp !== undefined && temp !== "") {
      json.width = temp;
    }

    temp = $tbl.attr("data-unused");
    if (temp !== null && temp !== undefined && temp !== "") {
      json.defaultUnused = temp;
    }

    temp = $tbl.attr("data-href");
    if (temp !== null && temp !== undefined && temp !== "") {
      json.href = temp;
    }

    json.table = '#' + $tbl.attr('id');

    temp = $tbl.attr("data-register");
    if (temp !== null && temp !== undefined && temp !== "") {
      json.register = temp;
    }

    json = parse_table(json, $tbl);

    //console.log("regpict.table.register json = " + JSON.stringify(json, null, 2));

    // insert a figure before this table
    $tbl.before("<figure id=\"fig-" + json.table.replace(/^#tbl-/, '') + "\" class=\"regpict-generated\">"
      + "<div class=\"svg\"></div>"
      + "<figcaption>" + $('caption', $tbl).text() + "</figcaption>"
      + "</figure>");
    const $divsvg = $('div.svg', $tbl.prev()).last();
    $divsvg.last().svg(function (svg) {
      json = draw_regpict(this, svg, json);
    });
    $tbl.before(`<pre style="display: none;">${JSON.stringify(json, null, 2)}</pre>`);
    insert_unused_table_rows($tbl, json);
    pub("end", "core/regpict table id='" + $tbl.attr("id") + "'");
  });

  $("figure.register", doc).each(
    function () {
      let $fig = $(this);
      let $tbl = undefined;
      let json = {};
      if ($fig.attr("id")) {
        json.figName = $fig.attr("id").replace(/^fig-/, "");
      } else if ($fig.attr("title")) {
        json.figName = $fig.attr("title");
      } else if ($("figcaption", this)) {
        json.figName = $("figcaption", this).text();
      } else {
        json.figName = "unnamed-" + figNum;
        figNum++;
      }
      json.figName = json.figName.toLowerCase()
        .replace(/^\s+/, "")
        .replace(/\s+$/, "")
        .replace(/[^\-.0-9a-z_]+/ig, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")
        .replace(/\.$/, ".x")
        .replace(/^([^a-z])/i, "x$1")
        .replace(/^$/, "generatedID");
      if (!$fig.attr("id")) {
        $fig.attr("id", "fig-" + json.figName);
      }
      pub("start", "core/regpict figure.register id='" + $fig.attr("id") + "'");

      let temp = $fig.attr("data-json");
      if (temp !== null && temp !== undefined && temp !== "") {
        let temp2 = {};
        try {
          temp2 = JSON.parse(temp);
          $.extend(true, json, temp2);
        } catch (e) {
          $fig.before("<p class=\"issue\">Invalid data-json attribute in next figure.register</p>");
          $fig.addclass("respec-error");
        }
      }

      temp = $fig.attr("data-width");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.width = temp;
      }

      temp = $fig.attr("data-unused");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.defaultUnused = temp;
      }

      temp = $fig.attr("data-href");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.href = temp;
      }

      temp = $fig.attr("data-table");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.table = temp;
      }

      temp = $fig.attr("data-register");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.register = temp;
      }

      $("pre.json,div.json,span.json", $fig).each(function () {
        let temp2 = {};
        try {
          temp2 = JSON.parse(this.textContent);
          $.extend(true, json, temp2);
          $(this).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in pre.json, div.json, or span.json</p>");
          $(this).addclass("respec-error");
        }
      });

      if ($fig.hasClass("pcisig_reg") && json.hasOwnProperty("table")) {
        $tbl = $(json.table, doc);
        json = parse_table(json, $tbl);
      }

      // invent a div to hold the svg, if necessary
      let $divsvg = $("div.svg", this).last();
      if ($divsvg.length === 0) {
        let $cap = $("figcaption", this);
        if ($cap.length > 0) {
          //console.log("inserting div.svg before <figcaption>");
          $cap.before('<div class="svg"></div>');
        } else {
          //console.log("inserting div.svg at end of <figure>");
          $(this).append('<div class="svg"></div>');
        }
        $divsvg = $("div.svg", this).last();
      }

      function merge_json(result, me) {
        let $me = $(me);
        let parents = $me.attr("data-parents");
        if (parents !== null && parents !== undefined && parents !== "") {
          // console.log("parents = \"" + parents + "\"");
          parents = parents.split(/\s+/);
          let i;
          for (i = 0; i < parents.length; i++) {
            let $temp = $("#" + parents[i]);
            // console.log("merging: #" + parents[i]);
            if ($temp.length > 0) {
              // console.log("merge_json: adding \"" + $temp[0].textContent + "\"");
              merge_json(result, $temp[0]);
              //$.extend(true, result, JSON.parse($temp[0].textContent));
              // console.log("result=" + JSON.stringify(result, null, 2));
              $temp.hide();
            }
          }
        }
        // console.log("merge_json: adding \"" + me.textContent + "\"");
        let temp2 = {};
        try {
          temp2 = JSON.parse(me.textContent);
          $.extend(true, result, temp2);
          // console.log("result=" + JSON.stringify(result, null, 2));
          $(me).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in next merge_json</p>");
          $(me).addclass("respec-error");
        }
      }

      let $render = $("pre.render,div.render,span.render", $fig);
      if ($render.length > 0) {
        $render.each(function (index) {
          let temp_json = {};
          $.extend(true, temp_json, json);
          merge_json(temp_json, this);
          //$(this).hide();
          $divsvg.last().makeID("svg", "render-" + index);
          $divsvg.last().svg(function (svg) {
            draw_regpict(this, svg, temp_json);
          });
          if (index < ($render.length - 1)) {
            $divsvg.after('<div class="svg"></div>');
            $divsvg = $("div.svg", $fig).last();
          }
        });
      } else if (json !== null) {
        $divsvg.last().svg(function (svg) {
          draw_regpict(this, svg, json);
        });
      } else {
        pub("warn",
          "core/regpict: no register definition " + $fig.get(0).outerHTML);
      }
      if ($tbl !== undefined) {
        insert_unused_table_rows($tbl, choose_defaults(json));
      }
      pub("end", "core/regpict figure.register id='" + $fig.attr("id") + "'");
    });

  $("figure.capability", doc).each(
    function () {
      let $fig = $(this);
      let $tbl = undefined;
      let json = {};
      if ($fig.attr("id")) {
        json.figName = $fig.attr("id").replace(/^fig-/, "");
      } else if ($fig.attr("title")) {
        json.figName = $fig.attr("title");
      } else if ($("figcaption", this)) {
        json.figName = $("figcaption", this).text();
      } else {
        json.figName = "unnamed-" + figNum;
        figNum++;
      }
      json.figName = json.figName.toLowerCase()
        .replace(/^\s+/, "")
        .replace(/\s+$/, "")
        .replace(/[^\-.0-9a-z_]+/ig, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")
        .replace(/\.$/, ".x")
        .replace(/^([^a-z])/i, "x$1")
        .replace(/^$/, "generatedID");
      if (!$fig.attr("id")) {
        $fig.attr("id", "fig-" + json.figName);
      }
      pub("start", "core/regpict figure.capability id='" + $fig.attr("id") + "'");

      json.forceFit = true;

      let temp = $fig.attr("data-json");
      if (temp !== null && temp !== undefined && temp !== "") {
        let temp2 = {};
        try {
          temp2 = JSON.parse(temp);
          $.extend(true, json, temp2);
        } catch (e) {
          $fig.before("<p class=\"issue\">Invalid data-json attribute in next figure.capability</p>");
          $fig.addclass("respec-error");
        }
      }

      temp = $fig.attr("data-width");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.width = temp;
      }

      temp = $fig.attr("data-unused");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.defaultUnused = temp;
      }

      $("pre.json,div.json,span.json", $fig).each(function () {
        let temp2 = {};
        try {
          temp2 = JSON.parse(this.textContent);
          $.extend(true, json, temp2);
          $(this).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in pre.json, div.json, or span.json</p>");
          $(this).addclass("respec-error");
        }
      });

      // invent a div to hold the svg, if necessary
      let $divsvg = $("div.svg", this).last();
      if ($divsvg.length === 0) {
        let $cap = $("figcaption", this);
        if ($cap.length > 0) {
          //console.log("inserting div.svg before <figcaption>");
          $cap.before('<div class="svg"></div>');
        } else {
          //console.log("inserting div.svg at end of <figure>");
          $(this).append('<div class="svg"></div>');
        }
        $divsvg = $("div.svg", this).last();
      }

      function merge_json(result, me) {
        let $me = $(me);
        let parents = $me.attr("data-parents");
        if (parents !== null && parents !== undefined && parents !== "") {
          // console.log("parents = \"" + parents + "\"");
          parents = parents.split(/\s+/);
          let i;
          for (i = 0; i < parents.length; i++) {
            let $temp = $("#" + parents[i]);
            // console.log("merging: #" + parents[i]);
            if ($temp.length > 0) {
              // console.log("merge_json: adding \"" + $temp[0].textContent + "\"");
              merge_json(result, $temp[0]);
              //$.extend(true, result, JSON.parse($temp[0].textContent));
              // console.log("result=" + JSON.stringify(result, null, 2));
              $temp.hide();
            }
          }
        }
        // console.log("merge_json: adding \"" + me.textContent + "\"");
        let temp2 = {};
        try {
          temp2 = JSON.parse(me.textContent);
          $.extend(true, result, temp2);
          // console.log("result=" + JSON.stringify(result, null, 2));
          $(me).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in next merge_json</p>");
          $(me).addclass("respec-error");
        }
      }

     if (json !== null) {
        $divsvg.last().svg(function (svg) {
          draw_regpict(this, svg, json);
        });
      } else {
        pub("warn",
          "core/regpict: no register definition " + $fig.get(0).outerHTML);
      }

      pub("end", "core/regpict figure.capability id='" + $fig.attr("id") + "'");
    });

  $("figure.message", doc).each(
    function () {
      let $fig = $(this);
      let $tbl = undefined;
      let json = {};
      if ($fig.attr("id")) {
        json.figName = $fig.attr("id").replace(/^fig-/, "");
      } else if ($fig.attr("title")) {
        json.figName = $fig.attr("title");
      } else if ($("figcaption", this)) {
        json.figName = $("figcaption", this).text();
      } else {
        json.figName = "unnamed-" + figNum;
        figNum++;
      }
      json.figName = json.figName.toLowerCase()
        .replace(/^\s+/, "")
        .replace(/\s+$/, "")
        .replace(/[^\-.0-9a-z_]+/ig, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")
        .replace(/\.$/, ".x")
        .replace(/^([^a-z])/i, "x$1")
        .replace(/^$/, "generatedID");
      if (!$fig.attr("id")) {
        $fig.attr("id", "fig-" + json.figName);
      }
      pub("start", "core/regpict figure.message id='" + $fig.attr("id") + "'");

      json.forceFit = true;

      let temp = $fig.attr("data-json");
      if (temp !== null && temp !== undefined && temp !== "") {
        let temp2 = {};
        try {
          temp2 = JSON.parse(temp);
          $.extend(true, json, temp2);
        } catch (e) {
          $fig.before("<p class=\"issue\">Invalid data-json attribute in next figure.message</p>");
          $fig.addclass("respec-error");
        }
      }

      temp = $fig.attr("data-width");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.width = temp;
      }

      temp = $fig.attr("data-unused");
      if (temp !== null && temp !== undefined && temp !== "") {
        json.defaultUnused = temp;
      }

      $("pre.json,div.json,span.json", $fig).each(function () {
        let temp2 = {};
        try {
          temp2 = JSON.parse(this.textContent);
          $.extend(true, json, temp2);
          $(this).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in pre.json, div.json, or span.json</p>");
          $(this).addclass("respec-error");
        }
      });

      // invent a div to hold the svg, if necessary
      let $divsvg = $("div.svg", this).last();
      if ($divsvg.length === 0) {
        let $cap = $("figcaption", this);
        if ($cap.length > 0) {
          //console.log("inserting div.svg before <figcaption>");
          $cap.before('<div class="svg"></div>');
        } else {
          //console.log("inserting div.svg at end of <figure>");
          $(this).append('<div class="svg"></div>');
        }
        $divsvg = $("div.svg", this).last();
      }

      function merge_json(result, me) {
        let $me = $(me);
        let parents = $me.attr("data-parents");
        if (parents !== null && parents !== undefined && parents !== "") {
          // console.log("parents = \"" + parents + "\"");
          parents = parents.split(/\s+/);
          let i;
          for (i = 0; i < parents.length; i++) {
            let $temp = $("#" + parents[i]);
            // console.log("merging: #" + parents[i]);
            if ($temp.length > 0) {
              // console.log("merge_json: adding \"" + $temp[0].textContent + "\"");
              merge_json(result, $temp[0]);
              //$.extend(true, result, JSON.parse($temp[0].textContent));
              // console.log("result=" + JSON.stringify(result, null, 2));
              $temp.hide();
            }
          }
        }
        // console.log("merge_json: adding \"" + me.textContent + "\"");
        let temp2 = {};
        try {
          temp2 = JSON.parse(me.textContent);
          $.extend(true, result, temp2);
          // console.log("result=" + JSON.stringify(result, null, 2));
          $(me).hide();
        } catch (e) {
          $tbl.before("<p class=\"issue\">Invalid JSON in next merge_json</p>");
          $(me).addclass("respec-error");
        }
      }

      if (json !== null) {
        $divsvg.last().svg(function (svg) {
          draw_regpict(this, svg, json);
        });
      } else {
        pub("warn",
          "core/regpict: no register definition " + $fig.get(0).outerHTML);
      }

      pub("end", "core/regpict figure.message id='" + $fig.attr("id") + "'");
    });

  cb();
}
