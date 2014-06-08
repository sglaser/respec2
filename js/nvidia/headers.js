/*jshint
    forin: false, laxcomma:true, jquery:true
*/
/*global Handlebars*/

/*global define, self, respecEvents, respecConfig */

// Module nvidia/headers
// Generate the headers material based on the provided configuration.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)
//  - shortName: the small name that is used after /TR/ in published reports (required)
//  - editors: an array of people editing the document (at least one is required). People
//      are defined using:
//          - name: the person's name (required)
//          - url: URI for the person's home page
//          - company: the person's company
//          - companyURL: the URI for the person's company
//          - mailto: the person's email
//          - note: a note on the person (e.g. former editor)
//  - authors: an array of people who are contributing authors of the document.
//  - subtitle: a subtitle for the specification
//  - publishDate: the date to use for the publication, default to document.lastModified, and
//      failing that to now. The format is YYYY-MM-DD or a Date object.
//  - previousPublishDate: The date on which the previous version was published.
//  - previousMaturity: The specStatus of the previous version
//
//  - thisVersion: the URI to the dated current version of the document.
//  - latestVersion: the URI to the latest (undated) version of the document.
//  - prevVersion: the URI to the previous (dated) version of the document.
//
//  - reviewEndDate: The date for the end of the review period (if any) The format is YYY-MM-DD or a Date object
//  - commentsPDF: The URI of the Acrobat Review enabled PDF file for this review.
//  - commentsNVBugs: Details of where in http://nvbugs, comments should be filed
//  - commentsEmail: email address that should get comments
//  - subjectPrefix: the string that is expected to be used as a subject prefix for email comments
//
//  - errata: the URI of the errata document, if any
//  - alternateFormats: a list of alternate formats for the document, each of which being
//      defined by:
//          - uri: the URI to the alternate
//          - label: a label for the alternate
//          - lang: optional language
//          - type: optional MIME type
//  - testSuiteURI: the URI to the test suite, if any
//  - bugTracker: and object with the following details
//      - open: pointer to the list of open bugs
//      - new: pointer to where to raise new bugs
//  - additionalCopyrightHolders: a copyright owner in addition to nvidia
//  - copyrightStart: the year from which the copyright starts running

//  - otherLinks: an array of other links that you might want in the header (e.g., link github, twitter, etc).
//         Example of usage: [{key: "foo", href:"http://b"}, {key: "bar", href:"http://"}].
//         Allowed values are:
//          - key: the key for the <dt> (e.g., "Bug Tracker"). Required.
//          - value: The value that will appear in the <dd> (e.g., "GitHub"). Optional.
//          - href: a URL for the value (e.g., "http://foo.com/issues"). Optional.
//          - class: a string representing CSS classes. Optional.

define(
    ["handlebars"
    , "core/utils"
    , "tmpl!nvidia/templates/headers.handlebars"
    , "tmpl!nvidia/templates/sotd.handlebars"
    ],
    function (hb, utils, headersTmpl, sotdTmpl) {
        "use strict";
        
        Handlebars.registerHelper("showPeople", function (name, items) {
            // stuff to handle RDFa
            var re = "",
                rp = "",
                rm = "",
                rn = "",
                rwu = "",
                rpu = "";

            if (this.doRDFa !== false) {
                if (name === "Editor") {
                    re = " rel='bibo:editor'";
                    if (this.doRDFa !== "1.0") re += " inlist=''";
                } else if (name === "Author") {
                    re = " rel='dcterms:contributor'";
                }
                rn = " property='foaf:name'";
                rm = " rel='foaf:mbox'";
                rp = " typeof='foaf:Person'";
                rwu = " rel='foaf:workplaceHomepage'";
                rpu = " rel='foaf:homepage'";
            }
            
            var ret = "";

            for (var i = 0, n = items.length; i < n; i++) {
                var p = items[i];
                if (this.doRDFa !== false)
                    ret += "<dd class='p-author h-card vcard' " + re + "><span" + rp + ">";
                else
                    ret += "<dd class='p-author h-card vcard'>";
                if (p.url) {
                    if (this.doRDFa !== false) {
                        ret += "<a class='u-url url p-name fn' " + rpu + rn + " content='" + p.name + "' href='" + p.url + "'>" + p.name + "</a>";
                    } else {
                        ret += "<a class='u-url url p-name fn' href='" + p.url + "'>" + p.name + "</a>";
                    }
                } else {
                    ret += "<span" + rn + " class='p-name fn'>" + p.name + "</span>";
                }
                if (p.company) {
                    ret += ", ";
                    if (p.companyURL)
                        ret += "<a" + rwu + " class='p-org org h-org h-card' href='" + p.companyURL + "'>" + p.company + "</a>";
                    else
                        ret += p.company;
                }
                if (p.mailto) {
                    ret += ", <span class='ed_mailto'><a class='u-email email' " + rm + " href='mailto:" + p.mailto + "'>" + p.mailto + "</a></span>";
                }
                if (p.note) ret += " (" + p.note + ")";
                if (this.doRDFa !== false) ret += "</span>\n";
                ret += "</dd>\n";
            }
            return new Handlebars.SafeString(ret);
        });


        return {
            status2Text: {
                WD:             "Working Draft",
                ED:             "Editor's Draft",
                REVIEW:         "Review Draft",
                TP:             "TechPubs Draft",
                RC:             "Release Candidate",
                PUBLISH:        "Published",
                POR:            "Plan of Record",

                NOTE:           "Note",
                confidential:   "Confidential",
                unofficial:     "Unofficial",
                base:           "Document"
            },
            noTrackStatus: ["NOTE", "confidential", "unofficial", "base"],
            run: function (conf, doc, cb, msg) {
                msg.pub("start", "nvidia/headers");

                if (conf.doRDFa !== false) {
                    if (conf.doRDFa === undefined) {
                        conf.doRDFa = '1.1';
                    }
                }

                if (!conf.figFmt) conf.figFmt = "%(Figure %1%c-%#%): %t";
                if (!conf.tblFmt) conf.tblFmt = "%(Table %1%c-%#%): %t";

                // validate configuration and derive new configuration values
                if (!conf.license) conf.license = "nvidia";
                if (!conf.specStatus) msg.pub("error", "Missing required configuration: specStatus");
                //                console.log("conf.specStatus = \"" + conf.specStatus + "\"");
                if (!conf.shortName) msg.pub("error", "Missing required configuration: shortName");
                conf.title = doc.title || "No Title";
                if (!conf.subtitle) conf.subtitle = "";
                if (!conf.publishDate) {
                    conf.publishDate = utils.parseLastModified(doc.lastModified);
                } else {
                    if (!(conf.publishDate instanceof Date))
                        conf.publishDate = utils.parseSimpleDate(conf.publishDate);
                }
                conf.publishYear = conf.publishDate.getFullYear();
                conf.publishHumanDate = utils.humanDate(conf.publishDate);
                if (conf.reviewEndDate) {
                    conf.humanReviewEndDate = utils.humanDate(conf.reviewEndDate);
                }
                conf.isNoTrack = $.inArray(conf.specStatus, this.noTrackStatus) >= 0;
                if (conf.specStatus in this.status2Text) {
                    conf.specStatusLong = this.status2Text[conf.specStatus];
                } else {
                    conf.specStatusLong = conf.specStatus;
                }

                if (!conf.edDraftURI) {
                    conf.edDraftURI = "";
                }

                if (conf.prevRecShortname && !conf.prevRecURI) {
                    conf.prevRecURI = "http://www.w3.org/TR/" + conf.prevRecShortname;
                }

                if (!conf.editors || conf.editors.length === 0) {
                    msg.pub("error", "At least one editor is required");
                }

                var peopCheck = function (i, it) {
                    if (!it.name) msg.pub("error", "All authors and editors must have a name.");
                };

                $.each(conf.editors, peopCheck);
                $.each(conf.authors || [], peopCheck);
                conf.multipleEditors = conf.editors.length > 1;
                conf.multipleAuthors = conf.authors && conf.authors.length > 1;

                $.each(conf.alternateFormats || [], function (i, it) {
                    if (!it.uri || !it.label) msg.pub("error", "All alternate formats must have a uri and a label.");
                });
                conf.multipleAlternates = conf.alternateFormats && conf.alternateFormats.length > 1;
                conf.alternatesHTML = utils.joinAnd(conf.alternateFormats, function (alt) {
                    var optional = (alt.hasOwnProperty('lang') && alt.lang) ? " hreflang='" + alt.lang + "'" : "";
                    optional += (alt.hasOwnProperty('type') && alt.type) ? " type='" + alt.type + "'" : "";
                    return "<a rel='alternate' href='" + alt.uri + "'" + optional + ">" + alt.label + "</a>";
                });

                if (conf.bugTracker) {
                    if (conf.bugTracker["new"] && conf.bugTracker.open) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker["new"] + "'>file a bug</a>" +
                            " (<a href='" + conf.bugTracker.open + "'>open bugs</a>)";
                    } else if (conf.bugTracker.open) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker.open + "'>open bugs</a>";
                    } else if (conf.bugTracker["new"]) {
                        conf.bugTrackerHTML = "<a href='" + conf.bugTracker["new"] + "'>file a bug</a>";
                    }
                }

                if (conf.copyrightStart && conf.copyrightStart === conf.publishYear) conf.copyrightStart = "";
                conf.isUnofficial = conf.specStatus === "unofficial";
                conf.prependLogo = conf.isUnofficial || !conf.isNoTrack;
                conf.isFinal = (conf.specStatus === "PUBLISH");
                conf.isPublished = conf.specStatus === "PUBLISH";
                conf.dashDate = utils.concatDate(conf.publishDate, "-");
                conf.publishISODate = utils.isoDate(conf.publishDate);
                // configuration done - yay!

                // annotate html element with RFDa
                if (conf.doRDFa) {
                    var $html = $("html");
                    if (conf.rdfStatus) {
                        $html.attr("typeof", "bibo:Document " + conf.rdfStatus);
                    } else {
                        $html.attr("typeof", "bibo:Document ");
                    }
                    $html.attr("about", "");
                    $html.attr("property", "dcterms:language");
                    $html.attr("content", "en");
                    var prefixes = "bibo: http://purl.org/ontology/bibo/";
                    if (conf.doRDFa !== '1.1') {
                        $html.attr("version", "XHTML+RDFa 1.0");
                        prefixes += " dcterms: http://purl.org/dc/terms/";
                        prefixes += " foaf: http://xmlns.com/foaf/0.1/";
                        prefixes += " xsd: http://www.w3.org/2001/XMLSchema#";
                    }
                    $html.attr("prefix", prefixes);
                }

                // insert into document and mark with microformat
                $("body", doc).prepend($(headersTmpl(conf)))
                    .addClass("h-entry");

                // handle SotD
                var $sotd = $("#sotd");
                if ((!conf.isNoTrack) && !$sotd.length)
                    msg.pub("error", "A custom SotD paragraph is required for your type of document.");
                conf.sotdCustomParagraph = $sotd.html();
                $sotd.remove();

                $(sotdTmpl(conf)).insertAfter($("#abstract"));

                msg.pub("end", "nvidia/headers");
                cb();
            }
        };
    }
);