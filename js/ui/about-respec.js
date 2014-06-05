
// Module ui/about-respec
// A simple about dialogue with pointer to the help

define(
    ["jquery"],
    function ($) {
        return {
            show:   function (ui) {
                var $halp = $("<div><p>ReSpec is a document production toolchain, with a notable focus on PCISIG specifications.</p></div>");
                $("<p>You can find more information in the <a href='http://sglaser.github.io/respec-docs/'>documentation</a>.</p>").appendTo($halp);
                $("<p>Found a bug in ReSpec? <a href='https://github.com/sglaser/respec/issues'>File it!</a>.</p>").appendTo($halp);
                $("<p>This is a PCISIG fork of the W3C oriented tool. You can find more about that version from the information in the <a href='http://w3.org/respec/'>documentation</a>.</p>").appendTo($halp);
                $("<p>Bugs in that version may be reported in <a href='https://github.com/darobin/respec/issues'>File it!</a>.</p>").appendTo($halp);

                ui.freshModal("About ReSpec", $halp);
            }
        };
    }
);
