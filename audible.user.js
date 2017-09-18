// ==UserScript==
// @name                Sortable Time in Audible Wishlist
// @description         Adds a time column to each page of the Audible Wishlist.
// @version             1.1.0
// @author              Michael Sergio <mikeserg@gmail.com>
// @namespace           https://github.com/michaelsergio/Sortable-Time-in-Audible-Wishlist
// @include             /http://www.audible.com/wl*/
// @grant               none
// @icon                http://www.audible.com/favicon.ico
// ==/UserScript==

/*jslint browser: true, white:true, devel:true, browser:true */


(function() {
  'use strict';

  const HEADER_NAME = 'Time';
  const EXT_NAME = 'adbl-ext-time';
  const COL_NUM = 7;


  function timeMakeInt(a) {
    let ahr, amin;
    ahr = (a.match(/(\d+) hr/) || 0)[1] || 0;
    amin = (a.match(/(\d+) min/) || 0)[1] || 0;
    // Number should have float place in range .0 - .59
    return parseInt(ahr, 10) + parseInt(amin, 10) * 0.01;
  }

  function timeTextComparator(a, b) {
    let aNum = timeMakeInt(a),
      bNum = timeMakeInt(b);
    if (aNum === bNum) { return 0; }
    return aNum < bNum ? -1 : 1;
  }

  function sortTable(table, col, reverse) {
    const tb = table.tBodies[0]; // use `<tbody>` to ignore `<thead>` and `<tfoot>` rows
    let tr = Array.prototype.slice.call(tb.rows, 0); // put rows into array
    reverse = -((+reverse) || -1);
    tr = tr.sort(function (a, b) { // sort rows
      if (!a.cells[col] || !b.cells[col]) { return -1; }
      if (a.cells[col].textContent === HEADER_NAME) { return -1; }
      return reverse * // `-1 *` if want opposite order
          timeTextComparator(a.cells[col].textContent.trim(),
          b.cells[col].textContent.trim());
    });
    let isEven = true;
    for (let row of tr) {
      // append each row in order
      // 0 is the header, so the odd numbered rows are 'even'
      if (isEven) {
        row.classList.add('adbl-even');
      } else {
        row.classList.remove('adbl-even');
      }
      tb.appendChild(row);
      isEven = !isEven;
    }
  }

  class TimeRepository {
    constructor() {
      this.storage = new LocalStorage();
      this.audible =  new AudibleService();
    }

    // Returns a promise
    getTime(url) {
      return new Promise((resolve, reject) => {
        this.storage.getTime(url).then((keys) => {
          const time = keys[url];
          if (time !== undefined) {
            console.log("Got time from cache");
            resolve(time);
          } else {
            this.audible.requestBookTime(url).then( (time) => {
              this.storage.putTime(url, time); // Cache entry for later
              resolve(time);
            }).catch( (reason) => {
              console.log('Could not load: ' + url);
              reject(reason);
            });
          }
        }).catch((reason) => {
          reject(reason);
        });
      });
    }
  }

  class LocalStorage {
    constructor() {
      this.storage = chrome.storage.local;
    }

    quotaCheck() {
      const limit = this.storage.QUOTA_BYTES - 1024;
      const storage = this.storage;
      storage.getBytesInUse(null, function(bytesInUse) {
        if (bytesInUse > limit) {
          storage.clear();
        }
      });
    }

    putTime(url, time) {
      this.quotaCheck();
      const obj = {};
      obj[url] = time;
      this.storage.set(obj);
    }

    // Returns a promise with a object {key: value}
    getTime(url) {
      return new Promise( (resolve, reject) => {
        this.storage.get(url, function(value) {
          resolve(value);
        });
      });
    }

  }

  class AudibleService {

    // This must return a promise
    requestBookTime(url) {
      console.log("Making xhr for " + url);
      return new Promise( (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        //xhr.theRow = row;
        xhr.responseType = 'document';
        xhr.onload = () => resolve(this.parseBookPage(xhr.responseXML));
        xhr.onerror = () => reject(xhr.statusText);
        console.log(xhr);
        xhr.send();
      });
    }

    parseBookPage(responseXML) {
      let runtime = responseXML.getElementsByClassName('adbl-run-time');
      let bookTime = '';
      if (runtime && runtime[0]) {
        bookTime = runtime[0].textContent;
      }
      return bookTime;
    }
  }

  class View {
    constructor() {
      this.wishlist = document.getElementsByTagName('table')[1];
      this.allRows = this.wishlist.getElementsByTagName('tr');
      this.sortDesc = false;
    }

    createTimeColumnInHeaderRow(row) {
      console.log('creating time');
      const header = document.createElement('th');
      header.innerHTML = `<a class="adbl-link" href="#!">${HEADER_NAME}</a>`;
      header.id = EXT_NAME;
      header.onclick = function() {
        sortTable(this.wishlist, COL_NUM, this.sortDesc);
        this.sortDesc = !this.sortDesc;
        return false;
      }.bind(this);
      row.appendChild(header);
    }

    getUrlForLinkDiv(linkDiv) {
      return linkDiv[0].getElementsByTagName('a')[0].href;
    }

    insertTimeIntoRow(row, time) {
      const cell = row.insertCell(-1);
      cell.className = 'adbl-col-7';
      cell.innerHTML = time;
    }
  }

  class ViewModel {
    constructor() {
      this.view = new View();
      this.repository = new TimeRepository();
    }

    load() {
      for (let row of this.view.allRows) {
        const linkDiv = row.getElementsByClassName('adbl-prod-title');
        if (linkDiv.length === 0) {
          this.view.createTimeColumnInHeaderRow(row);
        } else {
          const url = this.view.getUrlForLinkDiv(linkDiv);
          if (url === undefined) { continue; }

          const timePromise = this.repository.getTime(url);
          timePromise.then((time) => {
            this.view.insertTimeIntoRow(row, time);
          }).catch((reason) => {
            console.log(reason);
          });
        }
      }
    }
  }

  function audibleParse() {
    const vm = new ViewModel();
    vm.load();
  }

  //window.addEventListener("load", audibleParse, false);
  audibleParse();
})();
