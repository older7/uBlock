/*******************************************************************************

    uMatrix - a browser extension to benchmark browser session.
    Copyright (C) 2015 Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/sessbench
*/

/* jshint boss: true */
/* global vAPI, uDom */

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var messager = vAPI.messaging.channel('logger-ui.js');
var tbody = document.querySelector('#content tbody');
var trJunkyard = [];
var tdJunkyard = [];
var firstVarDataCol = 2;  // currently, column 2 (0-based index)
var lastVarDataIndex = 4; // currently, d0-d3
var maxEntries = 5000;
var noTabId = '';
var allTabIds = {};

var prettyRequestTypes = {
    'main_frame': 'doc',
    'stylesheet': 'css',
    'sub_frame': 'frame',
    'xmlhttprequest': 'xhr'
};

var timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
};

var dateOptions = {
    month: 'short',
    day: '2-digit'
};

/******************************************************************************/

// Emphasize hostname in URL, as this is what matters in uMatrix's rules.

var nodeFromURL = function(url, filter) {
    if ( filter.charAt(0) !== 's' ) {
        return document.createTextNode(url);
    }

    // make a regex out of the filter
    var reText = filter.slice(3);
    var pos = reText.indexOf('$');
    if ( pos > 0 ) {
        reText = reText.slice(0, pos);
    }
    if ( reText === '*' ) {
        reText = '\\*';
    } else if ( reText.charAt(0) === '/' && reText.slice(-1) === '/' ) {
        reText = reText.slice(1, -1);
    } else {
        reText = reText
            .replace(/\./g, '\\.')
            .replace(/\?/g, '\\?')
            .replace('||', '')
            .replace(/\^/g, '.')
            .replace(/^\|/g, '^')
            .replace(/\|$/g, '$')
            .replace(/\*/g, '.*')
            ;
    }
    var re = new RegExp(reText, 'gi');
    var matches = re.exec(url);
    if ( matches === null || matches[0].length === 0 ) {
        return document.createTextNode(url);
    }

    var node = renderedURLTemplate.cloneNode(true);
    node.childNodes[0].textContent = url.slice(0, matches.index);
    node.childNodes[1].textContent = url.slice(matches.index, re.lastIndex);
    node.childNodes[2].textContent = url.slice(re.lastIndex);
    return node;
};

var renderedURLTemplate = document.querySelector('#renderedURLTemplate > span');

/******************************************************************************/

var createCellAt = function(tr, index) {
    var td = tr.cells[index];
    var mustAppend = !td;
    if ( mustAppend ) {
        td = tdJunkyard.pop();
    }
    if ( td ) {
        td.removeAttribute('colspan');
        td.textContent = '';
    } else {
        td = document.createElement('td');
    }
    if ( mustAppend ) {
        tr.appendChild(td);
    }
    return td;
};

/******************************************************************************/

var createRow = function(layout) {
    var tr = trJunkyard.pop();
    if ( tr ) {
        tr.className = '';
    } else {
        tr = document.createElement('tr');
    }
    for ( var index = 0; index < firstVarDataCol; index++ ) {
        createCellAt(tr, index);
    }
    var i = 1, span = 1, td;
    for (;;) {
        td = createCellAt(tr, index);
        if ( i === lastVarDataIndex ) {
            break;
        }
        if ( layout.charAt(i) !== '1' ) {
            span += 1;
        } else {
            if ( span !== 1 ) {
                td.setAttribute('colspan', span);
            }
            index += 1;
            span = 1;
        }
        i += 1;
    }
    if ( span !== 1 ) {
        td.setAttribute('colspan', span);
    }
    index += 1;
    while ( td = tr.cells[index] ) {
        tdJunkyard.push(tr.removeChild(td));
    }
    return tr;
};

/******************************************************************************/

var createGap = function(tabId, url) {
    var tr = createRow('1');
    tr.classList.add('tab');
    tr.classList.add('canMtx');
    tr.classList.add('tab_' + tabId);
    tr.classList.add('maindoc');
    tr.cells[firstVarDataCol].textContent = url;
    tbody.insertBefore(tr, tbody.firstChild);
};

/******************************************************************************/

var renderNetLogEntry = function(tr, entry) {
    var filter = entry.d0;
    var type = entry.d1;
    var url = entry.d2;

    tr.classList.add('canMtx');

    // If the request is that of a root frame, insert a gap in the table
    // in order to visually separate entries for different documents. 
    if ( type === 'main_frame' ) {
        createGap(entry.tab, url);
    }

    // Cosmetic filter?
    if ( filter.charAt(0) === 'c' ) {
        tr.classList.add('cosmetic');
    }

    if ( filter.charAt(1) === 'b' ) {
        tr.classList.add('blocked');
        tr.cells[2].textContent = ' --';
    } else if ( filter.charAt(1) === 'a' ) {
        tr.classList.add('allowed');
        tr.cells[2].textContent = ' ++';
    } else {
        tr.cells[2].textContent = '';
    }

    var filterText = filter.slice(3);
    if ( filter.lastIndexOf('sa', 0) === 0 ) {
        filterText = '@@' + filterText;
    }

    tr.cells[3].textContent = filterText + '\t';
    tr.cells[4].textContent = (prettyRequestTypes[type] || type) + '\t';
    tr.cells[5].appendChild(nodeFromURL(url, filter));
};

/******************************************************************************/

var renderLogEntry = function(entry) {
    var tr;
    var fvdc = firstVarDataCol;

    switch ( entry.cat ) {
    case 'error':
    case 'info':
        tr = createRow('1');
        tr.cells[fvdc].textContent = entry.d0;
        break;

    case 'cosmetic':
    case 'net':
        tr = createRow('1111');
        renderNetLogEntry(tr, entry);
        break;

    default:
        tr = createRow('1');
        tr.cells[fvdc].textContent = entry.d0;
        break;
    }

    // Fields common to all rows.
    var time = new Date(entry.tstamp);
    tr.cells[0].textContent = time.toLocaleTimeString('fullwide', timeOptions);
    tr.cells[0].title = time.toLocaleDateString('fullwide', dateOptions);

    if ( entry.tab ) {
        tr.classList.add('tab');
        if ( entry.tab === noTabId ) {
            tr.classList.add('tab_bts');
        } else if ( entry.tab !== '' ) {
            tr.classList.add('tab_' + entry.tab);
        }
    }
    if ( entry.cat !== '' ) {
        tr.classList.add('cat_' + entry.cat);
    }

    rowFilterer.filterOne(tr, true);

    tbody.insertBefore(tr, tbody.firstChild);
};

/******************************************************************************/

var renderLogEntries = function(response) {
    document.body.classList.toggle('colorBlind', response.colorBlind);

    var entries = response.entries;
    if ( entries.length === 0 ) {
        return;
    }

    // Preserve scroll position
    var height = tbody.offsetHeight;

    var tabIds = response.tabIds;
    var n = entries.length;
    var entry;
    for ( var i = 0; i < n; i++ ) {
        entry = entries[i];
        // Unlikely, but it may happen
        if ( entry.tab && tabIds.hasOwnProperty(entry.tab) === false ) {
            continue;
        }
        renderLogEntry(entries[i]);
    }

    // Prevent logger from growing infinitely and eating all memory. For
    // instance someone could forget that it is left opened for some
    // dynamically refreshed pages.
    truncateLog(maxEntries);

    var yDelta = tbody.offsetHeight - height;
    if ( yDelta === 0 ) {
        return;
    }

    // Chromium:
    //   body.scrollTop = good value
    //   body.parentNode.scrollTop = 0
    if ( document.body.scrollTop !== 0 ) {
        document.body.scrollTop += yDelta;
        return;
    }

    // Firefox:
    //   body.scrollTop = 0
    //   body.parentNode.scrollTop = good value
    var parentNode = document.body.parentNode;
    if ( parentNode && parentNode.scrollTop !== 0 ) {
        parentNode.scrollTop += yDelta;
    }
};

/******************************************************************************/

var truncateLog = function(size) {
    if ( size === 0 ) {
        size = 5000;
    }
    var tbody = document.querySelector('#content tbody');
    size = Math.min(size, 10000);
    var tr;
    while ( tbody.childElementCount > size ) {
        tr = tbody.lastElementChild;
        trJunkyard.push(tbody.removeChild(tr));
    }
};

/******************************************************************************/

var onLogBufferRead = function(response) {
    // This tells us the behind-the-scene tab id
    noTabId = response.noTabId;

    // This may have changed meanwhile
    if ( response.maxEntries !== maxEntries ) {
        maxEntries = response.maxEntries;
        uDom('#maxEntries').val(maxEntries || '');
    }

    // Neuter rows for which a tab does not exist anymore
    // TODO: sort to avoid using indexOf
    var rowVoided = false;
    for ( var tabId in allTabIds ) {
        if ( allTabIds.hasOwnProperty(tabId) === false ) {
            continue;
        }
        if ( response.tabIds.hasOwnProperty(tabId) ) {
            continue;
        }
        toJunkyard(uDom('.tab_' + tabId));
        if ( tabId === popupManager.tabId ) {
            popupManager.toggleOff();
        }
        rowVoided = true;
    }
    allTabIds = response.tabIds;

    renderLogEntries(response);

    // Synchronize toolbar with content of log
    uDom('#clear').toggleClass(
        'disabled',
        tbody.querySelector('tr') === null
    );

    setTimeout(readLogBuffer, 1200);
};

/******************************************************************************/

// This can be called only once, at init time. After that, this will be called
// automatically. If called after init time, this will be messy, and this would
// require a bit more code to ensure no multi time out events.

var readLogBuffer = function() {
    messager.send({ what: 'readAll' }, onLogBufferRead);
};

/******************************************************************************/

var onMaxEntriesChanged = function() {
    var raw = uDom(this).val();
    try {
        maxEntries = parseInt(raw, 10);
        if ( isNaN(maxEntries) ) {
            maxEntries = 0;
        }
    } catch (e) {
        maxEntries = 0;
    }

    messager.send({
        what: 'userSettings',
        name: 'requestLogMaxEntries',
        value: maxEntries
    });

    truncateLog(maxEntries);
};

/******************************************************************************/

var rowFilterer = (function() {
    var filters = [];

    var parseInput = function() {
        filters = [];

        var rawPart, not, hardBeg, hardEnd, reStr;
        var raw = uDom('#filterInput').val().trim();
        var rawParts = raw.split(/\s+/);
        var i = rawParts.length;
        while ( i-- ) {
            rawPart = rawParts[i];
            not = rawPart.charAt(0) === '!';
            if ( not ) {
                rawPart = rawPart.slice(1);
            }
            hardBeg = rawPart.charAt(0) === '|';
            if ( hardBeg ) {
                rawPart = rawPart.slice(1);
            }
            hardEnd = rawPart.slice(-1) === '|';
            if ( hardEnd ) {
                rawPart = rawPart.slice(0, -1);
            }
            if ( rawPart === '' ) {
                continue;
            }
            // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
            reStr = rawPart.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                           .replace(/\*/g, '.*');
            if ( hardBeg ) {
                reStr = '(?:^|\\s)' + reStr;
            }
            if ( hardEnd ) {
                reStr += '(?:\\s|$)';
            }
            filters.push({
                re: new RegExp(reStr, 'i'),
                r: !not
            });
        }
    };

    var filterOne = function(tr, clean) {
        var ff = filters;
        var fcount = ff.length;
        if ( fcount === 0 && clean === true ) {
            return;
        }
        // do not filter out doc boundaries, they help separate important
        // section of log.
        var cl = tr.classList;
        if ( cl.contains('maindoc') ) {
            return;
        }
        if ( fcount === 0 ) {
            cl.remove('f');
            return;
        }
        var cc = tr.cells;
        var ccount = cc.length;
        var hit, j, f;
        // each filter expression must hit (implicit and-op)
        // if...
        //   positive filter expression = there must one hit on any field
        //   negative filter expression = there must be no hit on all fields
        for ( var i = 0; i < fcount; i++ ) {
            f = ff[i];
            hit = !f.r;
            for ( j = 0; j < ccount; j++ ) {
                if ( f.re.test(cc[j].textContent) ) {
                    hit = f.r;
                    break;
                }
            }
            if ( !hit ) {
                cl.add('f');
                return;
            }
        }
        cl.remove('f');
    };

    var filterAll = function() {
        // Special case: no filter
        if ( filters.length === 0 ) {
            uDom('#content tr').removeClass('f');
            return;
        }
        var tbody = document.querySelector('#content tbody');
        var rows = tbody.rows;
        var i = rows.length;
        while ( i-- ) {
            filterOne(rows[i]);
        }
    };

    var onFilterChangedAsync = (function() {
        var timer = null;
        var commit = function() {
            timer = null;
            parseInput();
            filterAll();
        };
        return function() {
            if ( timer !== null ) {
                clearTimeout(timer);
            }
            timer = setTimeout(commit, 750);
        };
    })();

    var onFilterButton = function() {
        var cl = document.body.classList;
        cl.toggle('f', cl.contains('f') === false);
    };

    uDom('#filterButton').on('click', onFilterButton);
    uDom('#filterInput').on('input', onFilterChangedAsync);

    return {
        filterOne: filterOne,
        filterAll: filterAll
    };
})();

/******************************************************************************/

var toJunkyard = function(trs) {
    trs.remove();
    var i = trs.length;
    while ( i-- ) {
        trJunkyard.push(trs.nodeAt(i));
    }
};

/******************************************************************************/

var clearBuffer = function() {
    var tbody = document.querySelector('#content tbody');
    var tr;
    while ( tbody.firstChild !== null ) {
        tr = tbody.lastElementChild;
        trJunkyard.push(tbody.removeChild(tr));
    }
    uDom('#clear').addClass('disabled');
};

/******************************************************************************/

var toggleCompactView = function() {
    document.body.classList.toggle(
        'compactView',
        document.body.classList.contains('compactView') === false
    );
};

/******************************************************************************/

var popupManager = (function() {
    var realTabId = null;
    var localTabId = null;
    var container = null;
    var movingOverlay = null;
    var popup = null;
    var popupObserver = null;
    var style = null;
    var styleTemplate = [
        'tr:not(.tab_{{tabId}}) {',
            'cursor: not-allowed;',
            'opacity: 0.2;',
        '}'
    ].join('\n');

    // Related to moving the popup around
    var xnormal, ynormal, crect, dx, dy, vw, vh;

    // Viewport data assumed to be properly set up
    var positionFromNormal = function(x, y) {
        if ( typeof x === 'number' ) {
            if ( x < 0.5 ) {
                container.style.setProperty('left', (x * vw) + 'px');
                container.style.removeProperty('right');
            } else {
                container.style.removeProperty('left');
                container.style.setProperty('right', ((1 - x) * vw) + 'px');
            }
        }
        if ( typeof y === 'number' ) {
            if ( y < 0.5 ) {
                container.style.setProperty('top', (y * vh) + 'px');
                container.style.removeProperty('bottom');
            } else {
                container.style.removeProperty('top');
                container.style.setProperty('bottom', ((1 - y) * vh) + 'px');
            }
        }
        // TODO: adjust size
    };
    var updateViewportData = function() {
        crect = container.getBoundingClientRect();
        vw = document.documentElement.clientWidth - crect.width;
        vh = document.documentElement.clientHeight - crect.height;
    };
    var toNormalX = function(x) {
        return xnormal = Math.max(Math.min(x / vw, 1), 0);
    };
    var toNormalY = function(y) {
        return ynormal = Math.max(Math.min(y / vh, 1), 0);
    };

    var onMouseMove = function(ev) {
        updateViewportData();
        positionFromNormal(
            toNormalX(ev.clientX + dx),
            toNormalY(ev.clientY + dy)
        );
        ev.stopPropagation();
        ev.preventDefault();
    };

    var onMouseUp = function(ev) {
        updateViewportData();
        positionFromNormal(
            toNormalX(ev.clientX + dx),
            toNormalY(ev.clientY + dy)
        );
        movingOverlay.removeEventListener('mouseup', onMouseUp);
        movingOverlay.removeEventListener('mousemove', onMouseMove);
        movingOverlay = null;
        container.classList.remove('moving');
        vAPI.localStorage.setItem('popupLastPosition', JSON.stringify({
            xnormal: xnormal,
            ynormal: ynormal
        }));
        ev.stopPropagation();
        ev.preventDefault();
    };

    var onMouseDown = function(ev) {
        if ( ev.target !== ev.currentTarget ) {
            return;
        }
        container.classList.add('moving');
        updateViewportData();
        dx = crect.left - ev.clientX;
        dy = crect.top - ev.clientY;
        movingOverlay = document.getElementById('movingOverlay');
        movingOverlay.addEventListener('mousemove', onMouseMove, true);
        movingOverlay.addEventListener('mouseup', onMouseUp, true);
        ev.stopPropagation();
        ev.preventDefault();
    };

    var resizePopup = function() {
        var popupBody = popup.contentWindow.document.body;
        if ( popupBody.clientWidth !== 0 && container.clientWidth !== popupBody.clientWidth ) {
            container.style.width = popupBody.clientWidth + 'px';
        }
        if ( popupBody.clientHeight !== 0 && popup.clientHeight !== popupBody.clientHeight ) {
            popup.style.height = popupBody.clientHeight + 'px';
        }
    };

    var onLoad = function() {
        resizePopup();
        popupObserver.observe(popup.contentDocument.body, {
            subtree: true,
            attributes: true
        });
    };

    var toggleOn = function(td) {
        var tr = td.parentNode;
        var matches = tr.className.match(/(?:^| )tab_([^ ]+)/);
        if ( matches === null ) {
            return;
        }
        realTabId = localTabId = matches[1];
        if ( localTabId === 'bts' ) {
            realTabId = noTabId;
        }

        // Use last normalized position if one is defined.
        // Default to top-right.
        var x = 1, y = 0;
        var json = vAPI.localStorage.getItem('popupLastPosition');
        if ( json ) {
            try {
                var popupLastPosition = JSON.parse(json);
                x = popupLastPosition.xnormal;
                y = popupLastPosition.ynormal;
            }
            catch (e) {
            }
        }
        container = document.getElementById('popupContainer');
        updateViewportData();
        positionFromNormal(x, y);

        // Window controls
        container.querySelector('div > span:first-child').addEventListener('click', toggleOff);
        container.querySelector('div').addEventListener('mousedown', onMouseDown);

        popup = document.createElement('iframe');
        popup.addEventListener('load', onLoad);
        popup.setAttribute('src', 'popup.html?tabId=' + realTabId);
        popupObserver = new MutationObserver(resizePopup);
        container.appendChild(popup);

        style = document.querySelector('#content > style');
        style.textContent = styleTemplate.replace('{{tabId}}', localTabId);

        document.body.classList.add('popupOn');
    };

    var toggleOff = function() {
        document.body.classList.remove('popupOn');

        // Just in case
        if ( movingOverlay !== null ) {
            movingOverlay.removeEventListener('mousemove', onMouseMove, true);
            movingOverlay.removeEventListener('mouseup', onMouseUp, true);
            movingOverlay = null;
        }

        // Window controls
        container.querySelector('div > span:first-child').removeEventListener('click', toggleOff);
        container.querySelector('div').removeEventListener('mousedown', onMouseDown);

        popup.removeEventListener('load', onLoad);
        popupObserver.disconnect();
        popupObserver = null;
        popup.setAttribute('src', '');
        container.removeChild(popup);
        popup = null;

        style.textContent = '';
        style = null;

        container = null;
        realTabId = null;
    };

    var exports = {
        toggleOn: function(ev) {
            if ( realTabId === null ) {
                toggleOn(ev.target);
            }
        },
        toggleOff: function() {
            if ( realTabId !== null ) {
                toggleOff();
            }
        }
    };

    Object.defineProperty(exports, 'tabId', {
        get: function() { return realTabId || 0; }
    });

    return exports;
})();

/******************************************************************************/

uDom.onLoad(function() {
    readLogBuffer();

    uDom('#compactViewToggler').on('click', toggleCompactView);
    uDom('#clear').on('click', clearBuffer);
    uDom('#maxEntries').on('change', onMaxEntriesChanged);
    uDom('#content table').on('click', 'tr.canMtx > td:nth-of-type(2)', popupManager.toggleOn);
});

/******************************************************************************/

})();
