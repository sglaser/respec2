// Module core/regpict
// Handles register pictures in the document. This encompasses two primary operations. One is
// extracting register information from a variety of table styles. The other is inventing an
// svg diagram that represents the fields in the table.
define(
    ["core/utils",
     "text!core/css/regpict.css",
     "jquery-svg/jquery.svg.js"],
    function (utils, css) {

        /*var defaultWidth = 32;
        var defaultUnused = "RsvdP";
        var cellWidth = 16;
        var cellHeight = 32;
        var cellInternalHeight = 8;
        var cellTop = 16;
        var validAttr = /^(rw|ro|rw1c|rw1s|hwinit|rws|ros|rw1cs|rw1ss|reserved|rsvd|rsvp|rsvz|zero|one|other)$/i;*/

        /*function remove_all_regpict() {
            $("div.regpict").remove();
        }

        function add_all_regpict() {
            $("div.register").each(add_regpict);
        }

        function replace_all_regpict() {
            remove_all_regpict();
            add_all_regpict();
        }

        function add_regpict() {
            var width = (this.dataset && this.dataset.width) || defaultWidth;
            var unused = (this.dataset && this.dataset.unused) || defaultUnused;
            var fields = [];

            $("table tbody", this).first().children().each(function () {
                var td = $(this).children();
                if (td.length >= 3) {
                    var bits = td.eq(0).text();
                    var desc = td.eq(1);
                    var attr = td.eq(2).text().toLowerCase();
                    var lsb, msb, match;
                    if ((match = /^(\d+):(\d+)$/.exec(bits)) !== null) {
                        msb = +match[1];
                        lsb = +match[2];
                        if (lsb > msb) {
                            msb = +match[2];
                            lsb = +match[1];
                        }
                    } else if ((match = /^(\d+)$/.exec(bits)) !== null) {
                        msb = lsb = +match[1];
                    } else {
                        msb = lsb = -1;
                    }
                    var fieldName = $("code:first", desc);
                    if (fieldName.length === 0) {
                        fieldName = /^\s*(\w+)/.exec(desc.text())[1];
                    } else {
                        fieldName = fieldName.first().text();
                    }
                    if (!validAttr.test(attr)) {
                        attr = "other";
                    }
                    fields.push({
                        "msb": msb,
                        "lsb": lsb,
                        "name": fieldName,
                        "attr": attr,
                        "unused": false
                    });
                }
            });
            var bitarray = [];
            bitarray[width] = 1000;
            for (var i = 0; i < width; i++) {
                bitarray[i] = -1;
            }
            fields.forEach(function (item, index) {
                for (var i = item.lsb; i <= item.msb; i++) {
                    bitarray[i] = index;
                }
            });
            var lsb = -1;
            for (var i = 0; i <= width; ++i) {
                if (lsb >= 0 && bitarray[i] >= 0) {
                    fields.push({
                        "msb": i - 1,
                        "lsb": lsb,
                        "name": ((i - lsb) * 2 - 1) >= unused.length ? unused : "R",
                        "attr": unused.toLowerCase(),
                        "unused": true
                    });
                    lsb = -1;
                }
                if (lsb < 0 && bitarray[i] < 0) {
                    lsb = i;
                }
            }
            $(this).data("regpict", {
                "fields": fields
            });
            var svgdiv_string = "<div class='regpict'/>";
            $(this).prepend(svgdiv_string);
            $("div.regpict", this).svg(draw_regpict);
        }*/
        
        function pget(obj, prop, def) {
            if ((obj !== null) && prop in obj)
                return obj[prop];
            else
                return def;
        }

        function draw_regpict(svg, reg) {
            var width               = Number(pget(reg, "width", 32));
            var unused              = String(pget(reg, "unused", "RsvdP"));
            var defaultAttr         = String(pget(reg, "defaultAttr", "other"));
            var cellWidth           = Number(pget(reg, "cellWidth", 16));
            var cellHeight          = Number(pget(reg, "cellHeight", 32));
            var cellInternalHeight  = Number(pget(reg, "cellInternalHeight", 8));
            var bracketHeight       = Number(pget(reg, "bracketHeight", 4));
            var cellTop             = Number(pget(reg, "cellTop", 16));
            var fields              = pget(reg, "fields", [ ]); // default to empty register
            if (! Array.isArray(fields)) fields = [ ];
            //console.log("draw_regpict: width=" + width + " unused ='" + unused + "' cellWidth=" + cellWidth + " cellHeight=" + cellHeight + " cellInternalHeight=" + cellInternalHeight + " cellTop=" + cellTop + " bracketHeight=" + bracketHeight);
            //console.log("draw_regpict: fields=" + fields.toString());
            
            // sanitize field array to avoid subsequent problems
            fields.forEach(function (item, index) {
                if (("msb" in item) && !("lsb" in item)) item.lsb = item.msb;
                if (("lsb" in item) && !("msb" in item)) item.msb = item.lsb;
                if (!("unused" in item)) item.unused = false;
                if (!("attr" in item)) item.attr = defaultAttr;
                if (!("name" in item)) item.name = "UNSPECIFIED NAME";
                //console.log("draw_regpict: field msb=" + item.msb + " lsb=" + item.lsb + " attr=" + item.attr + " unused=" + item.unused + " name='" + item.name + "'");
            
            });
            
            var bitarray = [];  // Array indexed by bit # in register range 0:width
                                // field[bitarray[N]] contains bit N
                                // bitarray[N] == -1 for unused bits
                                // bitarray[N] == 1000 for first bit outside register width
            
            bitarray[width] = 1000;
            for (var i = 0; i < width; i++) {
                bitarray[i] = -1;
            }
            fields.forEach(function (item, index) {
                for (var i = item.lsb; i <= item.msb; i++) {
                    bitarray[i] = index;
                }
            });
            
            var lsb = -1;   // if >= 0, contains bit# of lsb of a string of unused bits 
            for (var i = 0; i <= width; ++i) {
                if (lsb >= 0 && bitarray[i] >= 0) {
                    // first "used" bit after stretch of unused bits, invent an "unused" field
                    fields.push({
                        "msb": i - 1,
                        "lsb": lsb,
                        "name": ((i - lsb) * 2 - 1) >= unused.length ? unused : "R", // if full name fits, use it, else use "R"
                        "attr": unused.toLowerCase(),   // attribute is name
                        "unused": true
                    });
                    lsb = -1;
                }
                if (lsb < 0 && bitarray[i] < 0) {
                    // starting a string of unused bits
                    lsb = i;
                }
            }
            
            // x position of left edge of bit i
            function leftOf(i) {
                return cellWidth * (width - i - 0.5);
            }

            // x position of right edge of bit i
            function rightOf(i) {
                return cellWidth * (width - i + 0.5);
            }

            // x position of middle of bit i
            function middleOf(i) {
                return cellWidth * (width - i);
            }
            
            var g = svg.group();
            var p = svg.createPath();
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                var text = svg.text(g, middleOf(f.lsb), cellTop - 4,
                    svg.createText().string(f.lsb), {
                        class_: "regBitNum"
                    });
                if (f.lsb != f.msb) {
                    svg.text(g, middleOf(f.msb), cellTop - 4,
                        svg.createText().string(f.msb), {
                            class_: "regBitNum"
                        });
                }
                p.move(rightOf(f.lsb), cellTop - text.clientHeight).line(0, cellTop, true);
            }
            p.move(rightOf(width), cellTop / 3).line(0, cellTop, true);
            var nextBitLine = cellTop + cellHeight + 20; //76;
            var bitLineCount = 0;
            svg.path(g, p, {
                class_: "regBitNumLine",
                fill: "none"
            });
            for (var b = 0; b < width; b++) {
                for (var i = 0; i < fields.length; i++) {
                    var f = fields[i];
                    if (b == f.lsb) {
                        g = svg.group();
                        svg.rect(g, leftOf(f.msb), cellTop, rightOf(f.lsb) - leftOf(f.msb), cellHeight,
                            0, 0, {
                                class_: "regFieldBox regFieldBox" + f.attr
                            });
                        for (var j = f.lsb + 1; j <= f.msb; j++) {
                            svg.line(g,
                                rightOf(j), cellTop + cellHeight - cellInternalHeight,
                                rightOf(j), cellTop + cellHeight, {
                                    class_: "regFieldBoxInternal" +
                                        " regFieldBoxInternal" + f.attr
                                });
                        }
                        var text = svg.text(g, (leftOf(f.msb) + rightOf(f.lsb)) / 2, 32,
                            svg.createText().string(f.name), {
                                class_: "regFieldName" +
                                    " regFieldName" + f.attr +
                                    " regFieldNameInternal" +
                                    " regFieldNameInternal" + f.attr
                            });
                        if ("id" in f) {
                            svg.change(text, {id: f.id});
                        }
                        if ((text.clientWidth + 2 > rightOf(f.lsb) - leftOf(f.msb)) || (text.clientHeight + 2 > cellHeight - cellInternalHeight)) {
                            svg.change(text, {
                                x: rightOf(-0.5),
                                y: nextBitLine,
                                class_: "regFieldName" +
                                    " regFieldName" + f.attr +
                                    " regFieldName" + (bitLineCount < 2 ? "0" : "1")
                            });
                            p = svg.createPath();
                            p.move(leftOf(f.msb), cellTop + cellHeight)
                             .line((f.msb - f.lsb + 1) * cellWidth / 2, bracketHeight, true)
                             .line(rightOf(f.lsb), cellTop + cellHeight);
                            svg.path(g, p, {
                                class_: "regBitBracket" +
                                    " regBitBracket" + (bitLineCount < 2 ? "0" : "1"),
                                fill: "none"
                            });  
                            p = svg.createPath();
                            p.move(middleOf(f.lsb + ((f.msb - f.lsb)/2)), cellTop + cellHeight + bracketHeight)
                             .vert(nextBitLine - text.clientHeight / 4)
                             .horiz(rightOf(-0.4));
                            svg.path(g, p, {
                                class_: "regBitLine" +
                                    " regBitLine" + (bitLineCount < 2 ? "0" : "1"),
                                fill: "none"
                            });
                            nextBitLine += text.clientHeight + 2;
                            bitLineCount = (bitLineCount + 1) % 4;
                        }
                    }
                }
            }
            svg.configure({
                height: "" + nextBitLine,
                width: "100%"
            });
        }

        return {
            run: function (conf, doc, cb, msg) {
                msg.pub("start", "core/regpict");
                if (!conf.noReSpecCSS) {
                    $("<style/>").appendTo($("head", $(doc))).text(css);
                }
                $("figure.register", doc).each(function (index) {
                    var $fig = $(this);
                    var json = null;

                    var temp = $fig.attr("data-json");
                    if (temp != null && temp != undefined && temp != "") {
                        //console.log("parsing JSON '" + temp + "'");
                        json = $.parseJSON(temp);
                    }
                    
                    $("pre.json,div.json,span.json", $fig).each(function (index) {
                        json = $.parseJSON(this.textContent);
                        $(this).hide();
                    });
                    
                    if ($fig.hasClass("pcisig_reg")) {
                        if (json == null) json = { };
                        if (! ("fields" in json)) json.fields = [ ];
                        var $tbody = $($fig.attr("data-table") + " tbody", doc).first();
                        //console.log("pcisig_reg: tbody='" + $tbody.get(0).outerHTML);
                        $tbody.children().each(function () {
                            var td = $(this).children();
                            if (td.length >= 3) {
                                var bits = td.eq(0).text();
                                var desc = td.eq(1);
                                var attr = td.eq(2).text().toLowerCase();
                                var lsb, msb, match;
                                lsb = msb = -1;
                                if (match = /^(\d+)(:(\d+))?$/.exec(bits)) {
                                    msb = lsb = Number(match[1]);
                                    if (match[3] != null) lsb = Number(match[3]);
                                    if (lsb > msb) {
                                        msb = lsb; lsb = Number(match[1]);
                                    }
                                }
                                var fieldName = $("code:first, dfn:first", desc);
                                if (fieldName.length === 0) {
                                    fieldName = /^\s*(\w+)/.exec(desc.text())[1];
                                } else {
                                    fieldName = fieldName.first().text().trim();
                                }
                                var validAttr = /^(rw|rws|ro|ros|rw1c|rw1cs|hwinit|rsvp|rsvz|other)$/i;
                                if (!validAttr.test(attr)) {
                                    attr = "other";
                                }
                                json.fields.push({
                                    "msb": msb,
                                    "lsb": lsb,
                                    "name": fieldName,
                                    "attr": attr,
                                    "unused": false
                                });
                            }
                        });
                        //console.log("json=" + JSON.stringify(json, null, 2));
                    }
                    
                    if ($fig.hasClass("nv_refman")) {
                        if (json == null) json = { };
                        if (! ("fields" in json)) json.fields = [ ];
                        var pattern = new RegExp("^#\\s*define\\s+(" + json.register + ")(\\w*)\\s+(.*)\\s*/\\*\\s*(.*)\\s*\\*/\\s*$");
                        var bitpattern = /(\d+):(\d+)/;
                        var href = $fig.attr("data-href");
                        if (!!conf.ajaxIsLocal) $.ajaxSetup({ isLocal: true});
                        conf.ajaxIsLocal = false;
                        $.ajax({
                            dataType:   "text",
                            url:        href,
                            async:      false,
                            success:    function (data) {
                                if (data) {
                                    var lines = data.split(/\n/);
                                    for (var i = 0; i < lines.length; i++) {
                                        var match = pattern.exec(lines[i]);
                                        if (match) {
                                            if (! json.hasOwnProperty("width")) {
                                                if ((match[2] == "") && (match[4].substr(4,1) === "R")) {
                                                    var w = match[4].substr(3,1);
                                                    if (w === "2") json.width = 16;
                                                    else if (w === "4") json.width = 32;
                                                    else if (w === "8") json.width = 64;
                                                    else json.width = 32;
                                                }
                                            }
                                            if ((match[2] != "") && (match[4].substr(4,1) === "F")) {
                                                var bits = bitpattern.exec(match[3]);
                                                if (bits) {
                                                    json.fields.push({
                                                        msb : Number(bits[1]),
                                                        lsb : Number(bits[2]),
                                                        name: String(match[2].substr(1)),
                                                        id:   String(match[1] + match[2]),
                                                        attr: match[4].substr(0,2).toLowerCase() });
                                                } else {
                                                    msg.pub("error", "Unknown field width " + match[0]);
                                                }
                                            }
                                            //console.log("json=" + JSON.stringify(json, null, 2));
                                        }
                                    }
                                }
                            },
                            error:      function (xhr, status, error) {
                                msg.pub("error", "Error including URI=" + href + ": " + status + " (" + error + ")");
                            }
                        });
                    }
                    
                    if (json === null) {
                        msg.pub("warn", "core/regpict: no register definition " + $fig.get(0).outerHTML);
                    }

                    // invent a div to hold the svg, if necessary
                    var $divsvg = $("div.svg", this);
                    if ($divsvg.length === 0) {
                        var $cap = $("figcaption", this);
                        if ($cap.length > 0) {
                            //console.log("inserting div.svg before <figcaption>");
                            $cap.before('<div class="svg"></div>');
                        } else {
                            //console.log("inserting div.svg at end of <figure>");
                            $(this).append('<div class="svg"></div>');
                        }
                        $divsvg=$("div.svg", this);
                    }
                    if (json !== null) { $divsvg.first().svg(function(svg) { draw_regpict(svg, json); }); }
                });
                msg.pub("end", "core/regpict");
                cb();
            }
        };
    }
);