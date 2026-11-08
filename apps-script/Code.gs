// 야구맘기록지 → 구글 시트 모으기 (개발자 시트에 붙여 넣는 Apps Script)
//
// 앱이 "기록 함께 모으기"에 동의한 휴대폰에서 분석용 표(pitches · plays · games)를 보내면,
// 같은 이름의 탭에 줄을 넣는다. 열은 분석용 CSV와 같고, 맨 끝에 보낸 휴대폰을 구분하는 device_id를 붙인다.
// 같은 휴대폰·같은 경기의 줄은 지우고 새로 넣는다. (기록을 고치거나 취소해도 시트가 앱과 같아진다)
// 설치 방법은 docs/sheet-sync.md를 본다.

var APP_ID = 'yagumam';
var SUPPORTED_FORMAT_VERSION = 1;
var TABLE_NAMES = ['pitches', 'plays', 'games'];
var DEVICE_COLUMN = 'device_id';
var GAME_COLUMN = 'game_id';
/** 숫자로 둘 열의 타입. 나머지(ID·코드·날짜·글자)는 글자로 두어 시트가 날짜·숫자로 바꾸지 않게 한다. */
var NUMBER_TYPES = ['integer', 'number', 'binary'];
var MAX_GAMES_PER_REQUEST = 50;
var LOCK_WAIT_MS = 30000;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    var body = JSON.parse(e.postData.contents);
    return jsonOutput(applySync(SpreadsheetApp.getActiveSpreadsheet(), body));
  } catch (err) {
    return jsonOutput({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function isString(value) {
  return typeof value === 'string';
}

/** 앱이 보낸 내용이 맞는 모양인지 확인한다. 아니면 이유를 담아 멈춘다. */
function validateBody(body) {
  if (!body || body.app !== APP_ID) throw new Error('야구맘기록지에서 보낸 내용이 아닙니다.');
  if (body.analysisFormatVersion !== SUPPORTED_FORMAT_VERSION) {
    throw new Error('형식 버전이 다릅니다: ' + body.analysisFormatVersion + ' (이 스크립트는 ' + SUPPORTED_FORMAT_VERSION + ')');
  }
  if (!isString(body.deviceId) || !/^[0-9a-f-]{36}$/.test(body.deviceId)) throw new Error('휴대폰 구분 값이 없습니다.');
  if (body.deleteAll === true) return;
  if (!Array.isArray(body.games) || body.games.length > MAX_GAMES_PER_REQUEST) throw new Error('경기 목록이 잘못됐습니다.');
  if (!Array.isArray(body.deletedGameIds) || !body.deletedGameIds.every(isString)) throw new Error('지운 경기 목록이 잘못됐습니다.');
  TABLE_NAMES.forEach(function (name) {
    var table = body.tables && body.tables[name];
    if (!table || !Array.isArray(table.columns) || table.columns.length === 0) throw new Error(name + ' 열 정보가 없습니다.');
    table.columns.forEach(function (c) {
      if (!c || !isString(c.name) || !/^[a-z][a-z0-9_]{0,31}$/.test(c.name) || !isString(c.type)) throw new Error(name + ' 열 이름이 잘못됐습니다.');
    });
  });
  body.games.forEach(function (game) {
    if (!game || !isString(game.gameId) || !game.rows) throw new Error('경기 내용이 잘못됐습니다.');
    TABLE_NAMES.forEach(function (name) {
      var rows = game.rows[name];
      var width = body.tables[name].columns.length;
      if (!Array.isArray(rows)) throw new Error(name + ' 줄이 없습니다.');
      rows.forEach(function (row) {
        if (!Array.isArray(row) || row.length !== width) throw new Error(name + ' 줄의 칸 수가 열 수와 다릅니다.');
        row.forEach(function (v) {
          if (v !== null && typeof v !== 'string' && typeof v !== 'number') throw new Error(name + ' 칸 값이 잘못됐습니다.');
        });
      });
    });
  });
}

function sameHeader(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i += 1) if (String(a[i]) !== b[i]) return false;
  return true;
}

/**
 * 앱이 열을 끝에 더했으면(형식 버전은 그대로) 탭의 예전 줄에 빈 칸을 넣어 새 머리줄에 맞춘다.
 * 예전 머리줄이 새 머리줄의 앞부분이 아니면 null (열 구조가 다름)
 */
function widenRows(values, expected) {
  var oldColumns = values[0].map(String);
  var oldWidth = oldColumns.length - 1;
  var newWidth = expected.length - 1;
  if (oldColumns[oldWidth] !== DEVICE_COLUMN || oldWidth >= newWidth) return null;
  if (!sameHeader(oldColumns.slice(0, oldWidth), expected.slice(0, oldWidth))) return null;
  var blanks = [];
  for (var i = oldWidth; i < newWidth; i += 1) blanks.push('');
  return [expected].concat(values.slice(1).map(function (row) {
    return row.slice(0, oldWidth).concat(blanks, [row[oldWidth]]);
  }));
}

/** 시트의 지금 줄(머리줄 포함). 비어 있으면 [] */
function readValues(sheet) {
  return sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
}

/** 글자 열은 글자 서식(@)으로 둔다. ID나 날짜를 시트가 다른 값으로 바꾸지 않게 하기 위해서다. */
function applyTextFormats(sheet, columns, rowCount) {
  columns.forEach(function (c, i) {
    if (NUMBER_TYPES.indexOf(c.type) < 0) sheet.getRange(1, i + 1, rowCount, 1).setNumberFormat('@');
  });
  sheet.getRange(1, columns.length + 1, rowCount, 1).setNumberFormat('@');
}

/** 한 탭에서 이 휴대폰의 지울 경기 줄을 빼고, 새 줄을 더한다. */
function syncTable(book, name, body, removeIds) {
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    if (body.deleteAll === true) return 0;
    sheet = book.insertSheet(name);
  }
  var values = readValues(sheet);
  var header = values.length > 0 ? values[0].map(String) : null;
  if (body.deleteAll !== true) {
    var expected = body.tables[name].columns.map(function (c) { return c.name; }).concat([DEVICE_COLUMN]);
    if (header === null) header = expected;
    else if (!sameHeader(header, expected)) {
      var widened = widenRows(values, expected);
      if (widened === null) throw new Error(name + ' 탭의 열 구조가 앱과 다릅니다. 새 탭으로 옮기거나 형식 버전을 확인하세요.');
      values = widened;
      header = expected;
    }
  }
  if (header === null) return 0;
  var deviceIndex = header.indexOf(DEVICE_COLUMN);
  var gameIndex = header.indexOf(GAME_COLUMN);
  if (deviceIndex < 0 || gameIndex < 0) throw new Error(name + ' 탭에 ' + DEVICE_COLUMN + ' · ' + GAME_COLUMN + ' 열이 없습니다.');

  var before = Math.max(values.length - 1, 0);
  var kept = values.slice(1).filter(function (row) {
    if (String(row[deviceIndex]) !== body.deviceId) return true;
    return body.deleteAll === true ? false : !removeIds[String(row[gameIndex])];
  });
  var added = [];
  if (body.deleteAll !== true) {
    body.games.forEach(function (game) {
      game.rows[name].forEach(function (row) {
        added.push(row.map(function (v) { return v === null ? '' : v; }).concat([body.deviceId]));
      });
    });
  }
  var out = [header].concat(kept, added);
  sheet.clearContents();
  if (body.deleteAll !== true) applyTextFormats(sheet, body.tables[name].columns, out.length);
  sheet.getRange(1, 1, out.length, header.length).setValues(out);
  return before - kept.length;
}

/** 앱이 보낸 내용을 시트에 반영하고, 지운·넣은 줄 수를 돌려준다. */
function applySync(book, body) {
  validateBody(body);
  var removeIds = {};
  if (body.deleteAll !== true) {
    body.games.forEach(function (g) { removeIds[g.gameId] = true; });
    body.deletedGameIds.forEach(function (id) { removeIds[id] = true; });
  }
  var removed = 0;
  TABLE_NAMES.forEach(function (name) {
    removed += syncTable(book, name, body, removeIds);
  });
  return { ok: true, games: body.deleteAll === true ? 0 : body.games.length, removedRows: removed };
}
