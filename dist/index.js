require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 7942:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



// Ozark-trimmed entry point. Upstream's full re-export surface (Type,
// Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, dump, custom-type
// registry, safeLoad/safeLoadAll/safeDump shims) was reduced to only what
// the deterministic-deps consumer uses: load, loadAll, DEFAULT_SCHEMA,
// YAMLException. See OZARK-NOTES.md.

var loader = __nccwpck_require__(1287);


module.exports.load           = loader.load;
module.exports.loadAll        = loader.loadAll;
module.exports.DEFAULT_SCHEMA = __nccwpck_require__(2421);
module.exports.YAMLException = __nccwpck_require__(475);


/***/ }),

/***/ 7813:
/***/ ((module) => {




function isNothing(subject) {
  return (typeof subject === 'undefined') || (subject === null);
}


function isObject(subject) {
  return (typeof subject === 'object') && (subject !== null);
}


function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];

  return [ sequence ];
}


function extend(target, source) {
  var index, length, key, sourceKeys;

  if (source) {
    sourceKeys = Object.keys(source);

    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }

  return target;
}


function repeat(string, count) {
  var result = '', cycle;

  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }

  return result;
}


function isNegativeZero(number) {
  return (number === 0) && (Number.NEGATIVE_INFINITY === 1 / number);
}


module.exports.isNothing      = isNothing;
module.exports.isObject       = isObject;
module.exports.toArray        = toArray;
module.exports.repeat         = repeat;
module.exports.isNegativeZero = isNegativeZero;
module.exports.extend         = extend;


/***/ }),

/***/ 475:
/***/ ((module) => {

// YAML error class. http://stackoverflow.com/questions/8458984
//



function formatError(exception, compact) {
  var where = '', message = exception.reason || '(unknown reason)';

  if (!exception.mark) return message;

  if (exception.mark.name) {
    where += 'in "' + exception.mark.name + '" ';
  }

  where += '(' + (exception.mark.line + 1) + ':' + (exception.mark.column + 1) + ')';

  if (!compact && exception.mark.snippet) {
    where += '\n\n' + exception.mark.snippet;
  }

  return message + ' ' + where;
}


function YAMLException(reason, mark) {
  // Super constructor
  Error.call(this);

  this.name = 'YAMLException';
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);

  // Include stack trace in error object
  if (Error.captureStackTrace) {
    // Chrome and NodeJS
    Error.captureStackTrace(this, this.constructor);
  } else {
    // FF, IE 10+ and Safari 6+. Fallback for others
    this.stack = (new Error()).stack || '';
  }
}


// Inherit from Error
YAMLException.prototype = Object.create(Error.prototype);
YAMLException.prototype.constructor = YAMLException;


YAMLException.prototype.toString = function toString(compact) {
  return this.name + ': ' + formatError(this, compact);
};


module.exports = YAMLException;


/***/ }),

/***/ 1287:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



/*eslint-disable max-len,no-use-before-define*/

var common              = __nccwpck_require__(7813);
var YAMLException       = __nccwpck_require__(475);
var makeSnippet         = __nccwpck_require__(1663);
var DEFAULT_SCHEMA      = __nccwpck_require__(2421);


var _hasOwnProperty = Object.prototype.hasOwnProperty;


var CONTEXT_FLOW_IN   = 1;
var CONTEXT_FLOW_OUT  = 2;
var CONTEXT_BLOCK_IN  = 3;
var CONTEXT_BLOCK_OUT = 4;


var CHOMPING_CLIP  = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP  = 3;


var PATTERN_NON_PRINTABLE         = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS       = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE            = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI               = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;


function _class(obj) { return Object.prototype.toString.call(obj); }

function is_EOL(c) {
  return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function is_WHITE_SPACE(c) {
  return (c === 0x09/* Tab */) || (c === 0x20/* Space */);
}

function is_WS_OR_EOL(c) {
  return (c === 0x09/* Tab */) ||
         (c === 0x20/* Space */) ||
         (c === 0x0A/* LF */) ||
         (c === 0x0D/* CR */);
}

function is_FLOW_INDICATOR(c) {
  return c === 0x2C/* , */ ||
         c === 0x5B/* [ */ ||
         c === 0x5D/* ] */ ||
         c === 0x7B/* { */ ||
         c === 0x7D/* } */;
}

function fromHexCode(c) {
  var lc;

  if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
    return c - 0x30;
  }

  /*eslint-disable no-bitwise*/
  lc = c | 0x20;

  if ((0x61/* a */ <= lc) && (lc <= 0x66/* f */)) {
    return lc - 0x61 + 10;
  }

  return -1;
}

function escapedHexLen(c) {
  if (c === 0x78/* x */) { return 2; }
  if (c === 0x75/* u */) { return 4; }
  if (c === 0x55/* U */) { return 8; }
  return 0;
}

function fromDecimalCode(c) {
  if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
    return c - 0x30;
  }

  return -1;
}

function simpleEscapeSequence(c) {
  /* eslint-disable indent */
  return (c === 0x30/* 0 */) ? '\x00' :
        (c === 0x61/* a */) ? '\x07' :
        (c === 0x62/* b */) ? '\x08' :
        (c === 0x74/* t */) ? '\x09' :
        (c === 0x09/* Tab */) ? '\x09' :
        (c === 0x6E/* n */) ? '\x0A' :
        (c === 0x76/* v */) ? '\x0B' :
        (c === 0x66/* f */) ? '\x0C' :
        (c === 0x72/* r */) ? '\x0D' :
        (c === 0x65/* e */) ? '\x1B' :
        (c === 0x20/* Space */) ? ' ' :
        (c === 0x22/* " */) ? '\x22' :
        (c === 0x2F/* / */) ? '/' :
        (c === 0x5C/* \ */) ? '\x5C' :
        (c === 0x4E/* N */) ? '\x85' :
        (c === 0x5F/* _ */) ? '\xA0' :
        (c === 0x4C/* L */) ? '\u2028' :
        (c === 0x50/* P */) ? '\u2029' : '';
}

function charFromCodepoint(c) {
  if (c <= 0xFFFF) {
    return String.fromCharCode(c);
  }
  // Encode UTF-16 surrogate pair
  // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
  return String.fromCharCode(
    ((c - 0x010000) >> 10) + 0xD800,
    ((c - 0x010000) & 0x03FF) + 0xDC00
  );
}

// set a property of a literal object, while protecting against prototype pollution,
// see https://github.com/nodeca/js-yaml/issues/164 for more details
function setProperty(object, key, value) {
  // used for this specific key only because Object.defineProperty is slow
  if (key === '__proto__') {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: value
    });
  } else {
    object[key] = value;
  }
}

var simpleEscapeCheck = new Array(256); // integer, for fast access
var simpleEscapeMap = new Array(256);
for (var i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}


function State(input, options) {
  this.input = input;

  this.filename  = options['filename']  || null;
  this.schema    = options['schema']    || DEFAULT_SCHEMA;
  this.onWarning = options['onWarning'] || null;
  // (Hidden) Remove? makes the loader to expect YAML 1.1 documents
  // if such documents have no explicit %YAML directive
  this.legacy    = options['legacy']    || false;

  this.json      = options['json']      || false;
  this.listener  = options['listener']  || null;

  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap       = this.schema.compiledTypeMap;

  this.length     = input.length;
  this.position   = 0;
  this.line       = 0;
  this.lineStart  = 0;
  this.lineIndent = 0;

  // position of first leading tab in the current line,
  // used to make sure there are no tabs in the indentation
  this.firstTabInLine = -1;

  this.documents = [];

  /*
  this.version;
  this.checkLineBreaks;
  this.tagMap;
  this.anchorMap;
  this.tag;
  this.anchor;
  this.kind;
  this.result;*/

}


function generateError(state, message) {
  var mark = {
    name:     state.filename,
    buffer:   state.input.slice(0, -1), // omit trailing \0
    position: state.position,
    line:     state.line,
    column:   state.position - state.lineStart
  };

  mark.snippet = makeSnippet(mark);

  return new YAMLException(message, mark);
}

function throwError(state, message) {
  throw generateError(state, message);
}

function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}


var directiveHandlers = {

  YAML: function handleYamlDirective(state, name, args) {

    var match, major, minor;

    if (state.version !== null) {
      throwError(state, 'duplication of %YAML directive');
    }

    if (args.length !== 1) {
      throwError(state, 'YAML directive accepts exactly one argument');
    }

    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);

    if (match === null) {
      throwError(state, 'ill-formed argument of the YAML directive');
    }

    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);

    if (major !== 1) {
      throwError(state, 'unacceptable YAML version of the document');
    }

    state.version = args[0];
    state.checkLineBreaks = (minor < 2);

    if (minor !== 1 && minor !== 2) {
      throwWarning(state, 'unsupported YAML version of the document');
    }
  },

  TAG: function handleTagDirective(state, name, args) {

    var handle, prefix;

    if (args.length !== 2) {
      throwError(state, 'TAG directive accepts exactly two arguments');
    }

    handle = args[0];
    prefix = args[1];

    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, 'ill-formed tag handle (first argument) of the TAG directive');
    }

    if (_hasOwnProperty.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }

    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, 'ill-formed tag prefix (second argument) of the TAG directive');
    }

    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, 'tag prefix is malformed: ' + prefix);
    }

    state.tagMap[handle] = prefix;
  }
};


function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;

  if (start < end) {
    _result = state.input.slice(start, end);

    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 0x09 ||
              (0x20 <= _character && _character <= 0x10FFFF))) {
          throwError(state, 'expected valid JSON character');
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, 'the stream contains non-printable characters');
    }

    state.result += _result;
  }
}

function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;

  if (!common.isObject(source)) {
    throwError(state, 'cannot merge mappings; the provided source object is unacceptable');
  }

  sourceKeys = Object.keys(source);

  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];

    if (!_hasOwnProperty.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}

function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode,
  startLine, startLineStart, startPos) {

  var index, quantity;

  // The output is a plain object here, so keys can only be strings.
  // We need to convert keyNode to a string, but doing so can hang the process
  // (deeply nested arrays that explode exponentially using aliases).
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);

    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, 'nested arrays are not supported inside keys');
      }

      if (typeof keyNode === 'object' && _class(keyNode[index]) === '[object Object]') {
        keyNode[index] = '[object Object]';
      }
    }
  }

  // Avoid code execution in load() via toString property
  // (still use its own toString for arrays, timestamps,
  // and whatever user schema extensions happen to have @@toStringTag)
  if (typeof keyNode === 'object' && _class(keyNode) === '[object Object]') {
    keyNode = '[object Object]';
  }


  keyNode = String(keyNode);

  if (_result === null) {
    _result = {};
  }

  if (keyTag === 'tag:yaml.org,2002:merge') {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json &&
        !_hasOwnProperty.call(overridableKeys, keyNode) &&
        _hasOwnProperty.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, 'duplicated mapping key');
    }

    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }

  return _result;
}

function readLineBreak(state) {
  var ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x0A/* LF */) {
    state.position++;
  } else if (ch === 0x0D/* CR */) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 0x0A/* LF */) {
      state.position++;
    }
  } else {
    throwError(state, 'a line break is expected');
  }

  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}

function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0,
      ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 0x09/* Tab */ && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }

    if (allowComments && ch === 0x23/* # */) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0x0A/* LF */ && ch !== 0x0D/* CR */ && ch !== 0);
    }

    if (is_EOL(ch)) {
      readLineBreak(state);

      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;

      while (ch === 0x20/* Space */) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }

  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, 'deficient indentation');
  }

  return lineBreaks;
}

function testDocumentSeparator(state) {
  var _position = state.position,
      ch;

  ch = state.input.charCodeAt(_position);

  // Condition state.position === state.lineStart is tested
  // in parent on each call, for efficiency. No needs to test here again.
  if ((ch === 0x2D/* - */ || ch === 0x2E/* . */) &&
      ch === state.input.charCodeAt(_position + 1) &&
      ch === state.input.charCodeAt(_position + 2)) {

    _position += 3;

    ch = state.input.charCodeAt(_position);

    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }

  return false;
}

function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += ' ';
  } else if (count > 1) {
    state.result += common.repeat('\n', count - 1);
  }
}


function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding,
      following,
      captureStart,
      captureEnd,
      hasPendingContent,
      _line,
      _lineStart,
      _lineIndent,
      _kind = state.kind,
      _result = state.result,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (is_WS_OR_EOL(ch)      ||
      is_FLOW_INDICATOR(ch) ||
      ch === 0x23/* # */    ||
      ch === 0x26/* & */    ||
      ch === 0x2A/* * */    ||
      ch === 0x21/* ! */    ||
      ch === 0x7C/* | */    ||
      ch === 0x3E/* > */    ||
      ch === 0x27/* ' */    ||
      ch === 0x22/* " */    ||
      ch === 0x25/* % */    ||
      ch === 0x40/* @ */    ||
      ch === 0x60/* ` */) {
    return false;
  }

  if (ch === 0x3F/* ? */ || ch === 0x2D/* - */) {
    following = state.input.charCodeAt(state.position + 1);

    if (is_WS_OR_EOL(following) ||
        withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }

  state.kind = 'scalar';
  state.result = '';
  captureStart = captureEnd = state.position;
  hasPendingContent = false;

  while (ch !== 0) {
    if (ch === 0x3A/* : */) {
      following = state.input.charCodeAt(state.position + 1);

      if (is_WS_OR_EOL(following) ||
          withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }

    } else if (ch === 0x23/* # */) {
      preceding = state.input.charCodeAt(state.position - 1);

      if (is_WS_OR_EOL(preceding)) {
        break;
      }

    } else if ((state.position === state.lineStart && testDocumentSeparator(state)) ||
               withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;

    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);

      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }

    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }

    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }

    ch = state.input.charCodeAt(++state.position);
  }

  captureSegment(state, captureStart, captureEnd, false);

  if (state.result) {
    return true;
  }

  state.kind = _kind;
  state.result = _result;
  return false;
}

function readSingleQuotedScalar(state, nodeIndent) {
  var ch,
      captureStart, captureEnd;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x27/* ' */) {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x27/* ' */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);

      if (ch === 0x27/* ' */) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }

    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;

    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a single quoted scalar');

    } else {
      state.position++;
      captureEnd = state.position;
    }
  }

  throwError(state, 'unexpected end of the stream within a single quoted scalar');
}

function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart,
      captureEnd,
      hexLength,
      hexResult,
      tmp,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x22/* " */) {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x22/* " */) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;

    } else if (ch === 0x5C/* \ */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);

      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);

        // TODO: rework to inline fn with no type cast?
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;

      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;

        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);

          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;

          } else {
            throwError(state, 'expected hexadecimal character');
          }
        }

        state.result += charFromCodepoint(hexResult);

        state.position++;

      } else {
        throwError(state, 'unknown escape sequence');
      }

      captureStart = captureEnd = state.position;

    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;

    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a double quoted scalar');

    } else {
      state.position++;
      captureEnd = state.position;
    }
  }

  throwError(state, 'unexpected end of the stream within a double quoted scalar');
}

function readFlowCollection(state, nodeIndent) {
  var readNext = true,
      _line,
      _lineStart,
      _pos,
      _tag     = state.tag,
      _result,
      _anchor  = state.anchor,
      following,
      terminator,
      isPair,
      isExplicitPair,
      isMapping,
      overridableKeys = Object.create(null),
      keyNode,
      keyTag,
      valueNode,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x5B/* [ */) {
    terminator = 0x5D;/* ] */
    isMapping = false;
    _result = [];
  } else if (ch === 0x7B/* { */) {
    terminator = 0x7D;/* } */
    isMapping = true;
    _result = {};
  } else {
    return false;
  }

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(++state.position);

  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? 'mapping' : 'sequence';
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, 'missed comma between flow collection entries');
    } else if (ch === 0x2C/* , */) {
      // "flow collection entries can never be completely empty", as per YAML 1.2, section 7.4
      throwError(state, "expected the node content, but found ','");
    }

    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;

    if (ch === 0x3F/* ? */) {
      following = state.input.charCodeAt(state.position + 1);

      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }

    _line = state.line; // Save the current line.
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if ((isExplicitPair || state.line === _line) && ch === 0x3A/* : */) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }

    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }

    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x2C/* , */) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }

  throwError(state, 'unexpected end of the stream within a flow collection');
}

function readBlockScalar(state, nodeIndent) {
  var captureStart,
      folding,
      chomping       = CHOMPING_CLIP,
      didReadContent = false,
      detectedIndent = false,
      textIndent     = nodeIndent,
      emptyLines     = 0,
      atMoreIndented = false,
      tmp,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x7C/* | */) {
    folding = false;
  } else if (ch === 0x3E/* > */) {
    folding = true;
  } else {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';

  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);

    if (ch === 0x2B/* + */ || ch === 0x2D/* - */) {
      if (CHOMPING_CLIP === chomping) {
        chomping = (ch === 0x2B/* + */) ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, 'repeat of a chomping mode identifier');
      }

    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, 'bad explicit indentation width of a block scalar; it cannot be less than one');
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, 'repeat of an indentation width identifier');
      }

    } else {
      break;
    }
  }

  if (is_WHITE_SPACE(ch)) {
    do { ch = state.input.charCodeAt(++state.position); }
    while (is_WHITE_SPACE(ch));

    if (ch === 0x23/* # */) {
      do { ch = state.input.charCodeAt(++state.position); }
      while (!is_EOL(ch) && (ch !== 0));
    }
  }

  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;

    ch = state.input.charCodeAt(state.position);

    while ((!detectedIndent || state.lineIndent < textIndent) &&
           (ch === 0x20/* Space */)) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }

    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }

    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }

    // Zero-indentation block scalar is not allowed.
    // If textIndent is still 0 at this point, it means no explicit indentation
    // indicator was given and no indentation was detected in content lines.
    if (!detectedIndent && textIndent === 0) {
      throwError(state, 'missing indentation for block scalar');
    }

    // End of the scalar.
    if (state.lineIndent < textIndent) {

      // Perform the chomping.
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) { // i.e. only if the scalar is not empty.
          state.result += '\n';
        }
      }

      // Break this `while` cycle and go to the funciton's epilogue.
      break;
    }

    // Folded style: use fancy rules to handle line breaks.
    if (folding) {

      // Lines starting with white space characters (more-indented lines) are not folded.
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        // except for the first content line (cf. Example 8.1)
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);

      // End of more-indented block.
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat('\n', emptyLines + 1);

      // Just one line break - perceive as the same line.
      } else if (emptyLines === 0) {
        if (didReadContent) { // i.e. only if we have already read some scalar content.
          state.result += ' ';
        }

      // Several line breaks - perceive as different lines.
      } else {
        state.result += common.repeat('\n', emptyLines);
      }

    // Literal style: just add exact number of line breaks between content lines.
    } else {
      // Keep all line breaks except the header line break.
      state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
    }

    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;

    while (!is_EOL(ch) && (ch !== 0)) {
      ch = state.input.charCodeAt(++state.position);
    }

    captureSegment(state, captureStart, state.position, false);
  }

  return true;
}

function readBlockSequence(state, nodeIndent) {
  var _line,
      _tag      = state.tag,
      _anchor   = state.anchor,
      _result   = [],
      following,
      detected  = false,
      ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }

    if (ch !== 0x2D/* - */) {
      break;
    }

    following = state.input.charCodeAt(state.position + 1);

    if (!is_WS_OR_EOL(following)) {
      break;
    }

    detected = true;
    state.position++;

    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }

    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);

    ch = state.input.charCodeAt(state.position);

    if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
      throwError(state, 'bad indentation of a sequence entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }

  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'sequence';
    state.result = _result;
    return true;
  }
  return false;
}

function readBlockMapping(state, nodeIndent, flowIndent) {
  var following,
      allowCompact,
      _line,
      _keyLine,
      _keyLineStart,
      _keyPos,
      _tag          = state.tag,
      _anchor       = state.anchor,
      _result       = {},
      overridableKeys = Object.create(null),
      keyTag        = null,
      keyNode       = null,
      valueNode     = null,
      atExplicitKey = false,
      detected      = false,
      ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }

    following = state.input.charCodeAt(state.position + 1);
    _line = state.line; // Save the current line.

    //
    // Explicit notation case. There are two separate blocks:
    // first for the key (denoted by "?") and second for the value (denoted by ":")
    //
    if ((ch === 0x3F/* ? */ || ch === 0x3A/* : */) && is_WS_OR_EOL(following)) {

      if (ch === 0x3F/* ? */) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }

        detected = true;
        atExplicitKey = true;
        allowCompact = true;

      } else if (atExplicitKey) {
        // i.e. 0x3A/* : */ === character after the explicit key.
        atExplicitKey = false;
        allowCompact = true;

      } else {
        throwError(state, 'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
      }

      state.position += 1;
      ch = following;

    //
    // Implicit notation case. Flow-style node as the key first, then ":", and the value.
    //
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;

      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        // Neither implicit nor explicit notation.
        // Reading is done. Go to the epilogue.
        break;
      }

      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);

        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }

        if (ch === 0x3A/* : */) {
          ch = state.input.charCodeAt(++state.position);

          if (!is_WS_OR_EOL(ch)) {
            throwError(state, 'a whitespace character is expected after the key-value separator within a block mapping');
          }

          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }

          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;

        } else if (detected) {
          throwError(state, 'can not read an implicit mapping pair; a colon is missed');

        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true; // Keep the result of `composeNode`.
        }

      } else if (detected) {
        throwError(state, 'can not read a block mapping entry; a multiline key may not be an implicit key');

      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true; // Keep the result of `composeNode`.
      }
    }

    //
    // Common reading code for both explicit and implicit notations.
    //
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }

      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }

      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }

      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }

    if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
      throwError(state, 'bad indentation of a mapping entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }

  //
  // Epilogue.
  //

  // Special case: last mapping's node contains only the key in explicit notation.
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }

  // Expose the resulting mapping.
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'mapping';
    state.result = _result;
  }

  return detected;
}

function readTagProperty(state) {
  var _position,
      isVerbatim = false,
      isNamed    = false,
      tagHandle,
      tagName,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x21/* ! */) return false;

  if (state.tag !== null) {
    throwError(state, 'duplication of a tag property');
  }

  ch = state.input.charCodeAt(++state.position);

  if (ch === 0x3C/* < */) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);

  } else if (ch === 0x21/* ! */) {
    isNamed = true;
    tagHandle = '!!';
    ch = state.input.charCodeAt(++state.position);

  } else {
    tagHandle = '!';
  }

  _position = state.position;

  if (isVerbatim) {
    do { ch = state.input.charCodeAt(++state.position); }
    while (ch !== 0 && ch !== 0x3E/* > */);

    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, 'unexpected end of the stream within a verbatim tag');
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {

      if (ch === 0x21/* ! */) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);

          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, 'named tag handle cannot contain such characters');
          }

          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, 'tag suffix cannot contain exclamation marks');
        }
      }

      ch = state.input.charCodeAt(++state.position);
    }

    tagName = state.input.slice(_position, state.position);

    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, 'tag suffix cannot contain flow indicator characters');
    }
  }

  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, 'tag name cannot contain such characters: ' + tagName);
  }

  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, 'tag name is malformed: ' + tagName);
  }

  if (isVerbatim) {
    state.tag = tagName;

  } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;

  } else if (tagHandle === '!') {
    state.tag = '!' + tagName;

  } else if (tagHandle === '!!') {
    state.tag = 'tag:yaml.org,2002:' + tagName;

  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }

  return true;
}

function readAnchorProperty(state) {
  var _position,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x26/* & */) return false;

  if (state.anchor !== null) {
    throwError(state, 'duplication of an anchor property');
  }

  ch = state.input.charCodeAt(++state.position);
  _position = state.position;

  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }

  if (state.position === _position) {
    throwError(state, 'name of an anchor node must contain at least one character');
  }

  state.anchor = state.input.slice(_position, state.position);
  return true;
}

function readAlias(state) {
  var _position, alias,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x2A/* * */) return false;

  ch = state.input.charCodeAt(++state.position);
  _position = state.position;

  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }

  if (state.position === _position) {
    throwError(state, 'name of an alias node must contain at least one character');
  }

  alias = state.input.slice(_position, state.position);

  if (!_hasOwnProperty.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }

  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}

function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles,
      allowBlockScalars,
      allowBlockCollections,
      indentStatus = 1, // 1: this>parent, 0: this=parent, -1: this<parent
      atNewLine  = false,
      hasContent = false,
      typeIndex,
      typeQuantity,
      typeList,
      type,
      flowIndent,
      blockIndent;

  if (state.listener !== null) {
    state.listener('open', state);
  }

  state.tag    = null;
  state.anchor = null;
  state.kind   = null;
  state.result = null;

  allowBlockStyles = allowBlockScalars = allowBlockCollections =
    CONTEXT_BLOCK_OUT === nodeContext ||
    CONTEXT_BLOCK_IN  === nodeContext;

  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;

      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }

  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;

        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }

  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }

  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }

    blockIndent = state.position - state.lineStart;

    if (indentStatus === 1) {
      if (allowBlockCollections &&
          (readBlockSequence(state, blockIndent) ||
           readBlockMapping(state, blockIndent, flowIndent)) ||
          readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if ((allowBlockScalars && readBlockScalar(state, flowIndent)) ||
            readSingleQuotedScalar(state, flowIndent) ||
            readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;

        } else if (readAlias(state)) {
          hasContent = true;

          if (state.tag !== null || state.anchor !== null) {
            throwError(state, 'alias node should not have any properties');
          }

        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;

          if (state.tag === null) {
            state.tag = '?';
          }
        }

        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      // Special case: block sequences are allowed to have same indentation level as the parent.
      // http://www.yaml.org/spec/1.2/spec.html#id2799784
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }

  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }

  } else if (state.tag === '?') {
    // Implicit resolving is not allowed for non-scalar types, and '?'
    // non-specific tag is only automatically assigned to plain scalars.
    //
    // We only need to check kind conformity in case user explicitly assigns '?'
    // tag, for example like this: "!<?> [0]"
    //
    if (state.result !== null && state.kind !== 'scalar') {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }

    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type = state.implicitTypes[typeIndex];

      if (type.resolve(state.result)) { // `state.result` updated in resolver if matched
        state.result = type.construct(state.result);
        state.tag = type.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== '!') {
    if (_hasOwnProperty.call(state.typeMap[state.kind || 'fallback'], state.tag)) {
      type = state.typeMap[state.kind || 'fallback'][state.tag];
    } else {
      // looking for multi type
      type = null;
      typeList = state.typeMap.multi[state.kind || 'fallback'];

      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
    }

    if (!type) {
      throwError(state, 'unknown tag !<' + state.tag + '>');
    }

    if (state.result !== null && type.kind !== state.kind) {
      throwError(state, 'unacceptable node kind for !<' + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
    }

    if (!type.resolve(state.result, state.tag)) { // `state.result` updated in resolver if matched
      throwError(state, 'cannot resolve a node with !<' + state.tag + '> explicit tag');
    } else {
      state.result = type.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }

  if (state.listener !== null) {
    state.listener('close', state);
  }
  return state.tag !== null ||  state.anchor !== null || hasContent;
}

function readDocument(state) {
  var documentStart = state.position,
      _position,
      directiveName,
      directiveArgs,
      hasDirectives = false,
      ch;

  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = Object.create(null);
  state.anchorMap = Object.create(null);

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);

    ch = state.input.charCodeAt(state.position);

    if (state.lineIndent > 0 || ch !== 0x25/* % */) {
      break;
    }

    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;

    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }

    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];

    if (directiveName.length < 1) {
      throwError(state, 'directive name must not be less than one character in length');
    }

    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }

      if (ch === 0x23/* # */) {
        do { ch = state.input.charCodeAt(++state.position); }
        while (ch !== 0 && !is_EOL(ch));
        break;
      }

      if (is_EOL(ch)) break;

      _position = state.position;

      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }

      directiveArgs.push(state.input.slice(_position, state.position));
    }

    if (ch !== 0) readLineBreak(state);

    if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }

  skipSeparationSpace(state, true, -1);

  if (state.lineIndent === 0 &&
      state.input.charCodeAt(state.position)     === 0x2D/* - */ &&
      state.input.charCodeAt(state.position + 1) === 0x2D/* - */ &&
      state.input.charCodeAt(state.position + 2) === 0x2D/* - */) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);

  } else if (hasDirectives) {
    throwError(state, 'directives end mark is expected');
  }

  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);

  if (state.checkLineBreaks &&
      PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, 'non-ASCII line breaks are interpreted as content');
  }

  state.documents.push(state.result);

  if (state.position === state.lineStart && testDocumentSeparator(state)) {

    if (state.input.charCodeAt(state.position) === 0x2E/* . */) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }

  if (state.position < (state.length - 1)) {
    throwError(state, 'end of the stream or a document separator is expected');
  } else {
    return;
  }
}


function loadDocuments(input, options) {
  input = String(input);
  options = options || {};

  if (input.length !== 0) {

    // Add tailing `\n` if not exists
    if (input.charCodeAt(input.length - 1) !== 0x0A/* LF */ &&
        input.charCodeAt(input.length - 1) !== 0x0D/* CR */) {
      input += '\n';
    }

    // Strip BOM
    if (input.charCodeAt(0) === 0xFEFF) {
      input = input.slice(1);
    }
  }

  var state = new State(input, options);

  var nullpos = input.indexOf('\0');

  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, 'null byte is not allowed in input');
  }

  // Use 0 as string terminator. That significantly simplifies bounds check.
  state.input += '\0';

  while (state.input.charCodeAt(state.position) === 0x20/* Space */) {
    state.lineIndent += 1;
    state.position += 1;
  }

  while (state.position < (state.length - 1)) {
    readDocument(state);
  }

  return state.documents;
}


function loadAll(input, iterator, options) {
  if (iterator !== null && typeof iterator === 'object' && typeof options === 'undefined') {
    options = iterator;
    iterator = null;
  }

  var documents = loadDocuments(input, options);

  if (typeof iterator !== 'function') {
    return documents;
  }

  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}


function load(input, options) {
  var documents = loadDocuments(input, options);

  if (documents.length === 0) {
    /*eslint-disable no-undefined*/
    return undefined;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new YAMLException('expected a single document in the stream, but found more');
}


module.exports.loadAll = loadAll;
module.exports.load    = load;


/***/ }),

/***/ 7619:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



/*eslint-disable max-len*/

var YAMLException = __nccwpck_require__(475);
var Type          = __nccwpck_require__(2008);


function compileList(schema, name) {
  var result = [];

  schema[name].forEach(function (currentType) {
    var newIndex = result.length;

    result.forEach(function (previousType, previousIndex) {
      if (previousType.tag === currentType.tag &&
          previousType.kind === currentType.kind &&
          previousType.multi === currentType.multi) {

        newIndex = previousIndex;
      }
    });

    result[newIndex] = currentType;
  });

  return result;
}


function compileMap(/* lists... */) {
  var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: {
          scalar: [],
          sequence: [],
          mapping: [],
          fallback: []
        }
      }, index, length;

  function collectType(type) {
    if (type.multi) {
      result.multi[type.kind].push(type);
      result.multi['fallback'].push(type);
    } else {
      result[type.kind][type.tag] = result['fallback'][type.tag] = type;
    }
  }

  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}


function Schema(definition) {
  return this.extend(definition);
}


Schema.prototype.extend = function extend(definition) {
  var implicit = [];
  var explicit = [];

  if (definition instanceof Type) {
    // Schema.extend(type)
    explicit.push(definition);

  } else if (Array.isArray(definition)) {
    // Schema.extend([ type1, type2, ... ])
    explicit = explicit.concat(definition);

  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    // Schema.extend({ explicit: [ type1, type2, ... ], implicit: [ type1, type2, ... ] })
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);

  } else {
    throw new YAMLException('Schema.extend argument should be a Type, [ Type ], ' +
      'or a schema definition ({ implicit: [...], explicit: [...] })');
  }

  implicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }

    if (type.loadKind && type.loadKind !== 'scalar') {
      throw new YAMLException('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
    }

    if (type.multi) {
      throw new YAMLException('There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.');
    }
  });

  explicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }
  });

  var result = Object.create(Schema.prototype);

  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);

  result.compiledImplicit = compileList(result, 'implicit');
  result.compiledExplicit = compileList(result, 'explicit');
  result.compiledTypeMap  = compileMap(result.compiledImplicit, result.compiledExplicit);

  return result;
};


module.exports = Schema;


/***/ }),

/***/ 3573:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// Standard YAML's Core schema.
// http://www.yaml.org/spec/1.2/spec.html#id2804923
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, Core schema has no distinctions from JSON schema is JS-YAML.





module.exports = __nccwpck_require__(2372);


/***/ }),

/***/ 2421:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// JS-YAML's default schema for `safeLoad` function.
// It is not described in the YAML specification.
//
// This schema is based on standard YAML's Core schema and includes most of
// extra types described at YAML tag repository. (http://yaml.org/type/)





module.exports = (__nccwpck_require__(3573).extend)({
  implicit: [
    __nccwpck_require__(315),
    __nccwpck_require__(8687)
  ],
  explicit: [
    __nccwpck_require__(7666),
    __nccwpck_require__(6798),
    __nccwpck_require__(3810),
    __nccwpck_require__(4571)
  ]
});


/***/ }),

/***/ 4955:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// Standard YAML's Failsafe schema.
// http://www.yaml.org/spec/1.2/spec.html#id2802346





var Schema = __nccwpck_require__(7619);


module.exports = new Schema({
  explicit: [
    __nccwpck_require__(3528),
    __nccwpck_require__(5480),
    __nccwpck_require__(3277)
  ]
});


/***/ }),

/***/ 2372:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// Standard YAML's JSON schema.
// http://www.yaml.org/spec/1.2/spec.html#id2803231
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, this schema is not such strict as defined in the YAML specification.
// It allows numbers in binary notaion, use `Null` and `NULL` as `null`, etc.





module.exports = (__nccwpck_require__(4955).extend)({
  implicit: [
    __nccwpck_require__(7322),
    __nccwpck_require__(603),
    __nccwpck_require__(7414),
    __nccwpck_require__(1657)
  ]
});


/***/ }),

/***/ 1663:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {




var common = __nccwpck_require__(7813);


// get snippet for a single line, respecting maxLength
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = '';
  var tail = '';
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;

  if (position - lineStart > maxHalfLength) {
    head = ' ... ';
    lineStart = position - maxHalfLength + head.length;
  }

  if (lineEnd - position > maxHalfLength) {
    tail = ' ...';
    lineEnd = position + maxHalfLength - tail.length;
  }

  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, '→') + tail,
    pos: position - lineStart + head.length // relative position
  };
}


function padStart(string, max) {
  return common.repeat(' ', max - string.length) + string;
}


function makeSnippet(mark, options) {
  options = Object.create(options || null);

  if (!mark.buffer) return null;

  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent      !== 'number') options.indent      = 1;
  if (typeof options.linesBefore !== 'number') options.linesBefore = 3;
  if (typeof options.linesAfter  !== 'number') options.linesAfter  = 2;

  var re = /\r?\n|\r|\0/g;
  var lineStarts = [ 0 ];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;

  while ((match = re.exec(mark.buffer))) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);

    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }

  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;

  var result = '', i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);

  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(' ', options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) +
      ' | ' + line.str + '\n' + result;
  }

  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(' ', options.indent) + padStart((mark.line + 1).toString(), lineNoLength) +
    ' | ' + line.str + '\n';
  result += common.repeat('-', options.indent + lineNoLength + 3 + line.pos) + '^' + '\n';

  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(' ', options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) +
      ' | ' + line.str + '\n';
  }

  return result.replace(/\n$/, '');
}


module.exports = makeSnippet;


/***/ }),

/***/ 2008:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var YAMLException = __nccwpck_require__(475);

var TYPE_CONSTRUCTOR_OPTIONS = [
  'kind',
  'multi',
  'resolve',
  'construct',
  'instanceOf',
  'predicate',
  'represent',
  'representName',
  'defaultStyle',
  'styleAliases'
];

var YAML_NODE_KINDS = [
  'scalar',
  'sequence',
  'mapping'
];

function compileStyleAliases(map) {
  var result = {};

  if (map !== null) {
    Object.keys(map).forEach(function (style) {
      map[style].forEach(function (alias) {
        result[String(alias)] = style;
      });
    });
  }

  return result;
}

function Type(tag, options) {
  options = options || {};

  Object.keys(options).forEach(function (name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });

  // TODO: Add tag format check.
  this.options       = options; // keep original options in case user wants to extend this type later
  this.tag           = tag;
  this.kind          = options['kind']          || null;
  this.resolve       = options['resolve']       || function () { return true; };
  this.construct     = options['construct']     || function (data) { return data; };
  this.instanceOf    = options['instanceOf']    || null;
  this.predicate     = options['predicate']     || null;
  this.represent     = options['represent']     || null;
  this.representName = options['representName'] || null;
  this.defaultStyle  = options['defaultStyle']  || null;
  this.multi         = options['multi']         || false;
  this.styleAliases  = compileStyleAliases(options['styleAliases'] || null);

  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}

module.exports = Type;


/***/ }),

/***/ 7666:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



/*eslint-disable no-bitwise*/


var Type = __nccwpck_require__(2008);


// [ 64, 65, 66 ] -> [ padding, CR, LF ]
var BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';


function resolveYamlBinary(data) {
  if (data === null) return false;

  var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;

  // Convert one by one.
  for (idx = 0; idx < max; idx++) {
    code = map.indexOf(data.charAt(idx));

    // Skip CR/LF
    if (code > 64) continue;

    // Fail on illegal characters
    if (code < 0) return false;

    bitlen += 6;
  }

  // If there are any bits left, source was corrupted
  return (bitlen % 8) === 0;
}

function constructYamlBinary(data) {
  var idx, tailbits,
      input = data.replace(/[\r\n=]/g, ''), // remove CR/LF & padding to simplify scan
      max = input.length,
      map = BASE64_MAP,
      bits = 0,
      result = [];

  // Collect by 6*4 bits (3 bytes)

  for (idx = 0; idx < max; idx++) {
    if ((idx % 4 === 0) && idx) {
      result.push((bits >> 16) & 0xFF);
      result.push((bits >> 8) & 0xFF);
      result.push(bits & 0xFF);
    }

    bits = (bits << 6) | map.indexOf(input.charAt(idx));
  }

  // Dump tail

  tailbits = (max % 4) * 6;

  if (tailbits === 0) {
    result.push((bits >> 16) & 0xFF);
    result.push((bits >> 8) & 0xFF);
    result.push(bits & 0xFF);
  } else if (tailbits === 18) {
    result.push((bits >> 10) & 0xFF);
    result.push((bits >> 2) & 0xFF);
  } else if (tailbits === 12) {
    result.push((bits >> 4) & 0xFF);
  }

  return new Uint8Array(result);
}

function representYamlBinary(object /*, style*/) {
  var result = '', bits = 0, idx, tail,
      max = object.length,
      map = BASE64_MAP;

  // Convert every three bytes to 4 ASCII characters.

  for (idx = 0; idx < max; idx++) {
    if ((idx % 3 === 0) && idx) {
      result += map[(bits >> 18) & 0x3F];
      result += map[(bits >> 12) & 0x3F];
      result += map[(bits >> 6) & 0x3F];
      result += map[bits & 0x3F];
    }

    bits = (bits << 8) + object[idx];
  }

  // Dump tail

  tail = max % 3;

  if (tail === 0) {
    result += map[(bits >> 18) & 0x3F];
    result += map[(bits >> 12) & 0x3F];
    result += map[(bits >> 6) & 0x3F];
    result += map[bits & 0x3F];
  } else if (tail === 2) {
    result += map[(bits >> 10) & 0x3F];
    result += map[(bits >> 4) & 0x3F];
    result += map[(bits << 2) & 0x3F];
    result += map[64];
  } else if (tail === 1) {
    result += map[(bits >> 2) & 0x3F];
    result += map[(bits << 4) & 0x3F];
    result += map[64];
    result += map[64];
  }

  return result;
}

function isBinary(obj) {
  return Object.prototype.toString.call(obj) ===  '[object Uint8Array]';
}

module.exports = new Type('tag:yaml.org,2002:binary', {
  kind: 'scalar',
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});


/***/ }),

/***/ 603:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

function resolveYamlBoolean(data) {
  if (data === null) return false;

  var max = data.length;

  return (max === 4 && (data === 'true' || data === 'True' || data === 'TRUE')) ||
         (max === 5 && (data === 'false' || data === 'False' || data === 'FALSE'));
}

function constructYamlBoolean(data) {
  return data === 'true' ||
         data === 'True' ||
         data === 'TRUE';
}

function isBoolean(object) {
  return Object.prototype.toString.call(object) === '[object Boolean]';
}

module.exports = new Type('tag:yaml.org,2002:bool', {
  kind: 'scalar',
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function (object) { return object ? 'true' : 'false'; },
    uppercase: function (object) { return object ? 'TRUE' : 'FALSE'; },
    camelcase: function (object) { return object ? 'True' : 'False'; }
  },
  defaultStyle: 'lowercase'
});


/***/ }),

/***/ 1657:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var common = __nccwpck_require__(7813);
var Type   = __nccwpck_require__(2008);

var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  '^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
  // .2e4, .2
  // special case, seems not from spec
  '|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
  // .inf
  '|[-+]?\\.(?:inf|Inf|INF)' +
  // .nan
  '|\\.(?:nan|NaN|NAN))$');

function resolveYamlFloat(data) {
  if (data === null) return false;

  if (!YAML_FLOAT_PATTERN.test(data) ||
      // Quick hack to not allow integers end with `_`
      // Probably should update regexp & check speed
      data[data.length - 1] === '_') {
    return false;
  }

  return true;
}

function constructYamlFloat(data) {
  var value, sign;

  value  = data.replace(/_/g, '').toLowerCase();
  sign   = value[0] === '-' ? -1 : 1;

  if ('+-'.indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }

  if (value === '.inf') {
    return (sign === 1) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  } else if (value === '.nan') {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}


var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;

function representYamlFloat(object, style) {
  var res;

  if (isNaN(object)) {
    switch (style) {
      case 'lowercase': return '.nan';
      case 'uppercase': return '.NAN';
      case 'camelcase': return '.NaN';
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase': return '.inf';
      case 'uppercase': return '.INF';
      case 'camelcase': return '.Inf';
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase': return '-.inf';
      case 'uppercase': return '-.INF';
      case 'camelcase': return '-.Inf';
    }
  } else if (common.isNegativeZero(object)) {
    return '-0.0';
  }

  res = object.toString(10);

  // JS stringifier can build scientific format without dots: 5e-100,
  // while YAML requres dot: 5.e-100. Fix it with simple hack

  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
}

function isFloat(object) {
  return (Object.prototype.toString.call(object) === '[object Number]') &&
         (object % 1 !== 0 || common.isNegativeZero(object));
}

module.exports = new Type('tag:yaml.org,2002:float', {
  kind: 'scalar',
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: 'lowercase'
});


/***/ }),

/***/ 7414:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var common = __nccwpck_require__(7813);
var Type   = __nccwpck_require__(2008);

function isHexCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) ||
         ((0x41/* A */ <= c) && (c <= 0x46/* F */)) ||
         ((0x61/* a */ <= c) && (c <= 0x66/* f */));
}

function isOctCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x37/* 7 */));
}

function isDecCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */));
}

function resolveYamlInteger(data) {
  if (data === null) return false;

  var max = data.length,
      index = 0,
      hasDigits = false,
      ch;

  if (!max) return false;

  ch = data[index];

  // sign
  if (ch === '-' || ch === '+') {
    ch = data[++index];
  }

  if (ch === '0') {
    // 0
    if (index + 1 === max) return true;
    ch = data[++index];

    // base 2, base 8, base 16

    if (ch === 'b') {
      // base 2
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (ch !== '0' && ch !== '1') return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }


    if (ch === 'x') {
      // base 16
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }


    if (ch === 'o') {
      // base 8
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }
  }

  // base 10 (except 0)

  // value should not start with `_`;
  if (ch === '_') return false;

  for (; index < max; index++) {
    ch = data[index];
    if (ch === '_') continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }

  // Should have digits and should not end with `_`
  if (!hasDigits || ch === '_') return false;

  return true;
}

function constructYamlInteger(data) {
  var value = data, sign = 1, ch;

  if (value.indexOf('_') !== -1) {
    value = value.replace(/_/g, '');
  }

  ch = value[0];

  if (ch === '-' || ch === '+') {
    if (ch === '-') sign = -1;
    value = value.slice(1);
    ch = value[0];
  }

  if (value === '0') return 0;

  if (ch === '0') {
    if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
    if (value[1] === 'x') return sign * parseInt(value.slice(2), 16);
    if (value[1] === 'o') return sign * parseInt(value.slice(2), 8);
  }

  return sign * parseInt(value, 10);
}

function isInteger(object) {
  return (Object.prototype.toString.call(object)) === '[object Number]' &&
         (object % 1 === 0 && !common.isNegativeZero(object));
}

module.exports = new Type('tag:yaml.org,2002:int', {
  kind: 'scalar',
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary:      function (obj) { return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1); },
    octal:       function (obj) { return obj >= 0 ? '0o'  + obj.toString(8) : '-0o'  + obj.toString(8).slice(1); },
    decimal:     function (obj) { return obj.toString(10); },
    /* eslint-disable max-len */
    hexadecimal: function (obj) { return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() :  '-0x' + obj.toString(16).toUpperCase().slice(1); }
  },
  defaultStyle: 'decimal',
  styleAliases: {
    binary:      [ 2,  'bin' ],
    octal:       [ 8,  'oct' ],
    decimal:     [ 10, 'dec' ],
    hexadecimal: [ 16, 'hex' ]
  }
});


/***/ }),

/***/ 3277:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

module.exports = new Type('tag:yaml.org,2002:map', {
  kind: 'mapping',
  construct: function (data) { return data !== null ? data : {}; }
});


/***/ }),

/***/ 8687:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

function resolveYamlMerge(data) {
  return data === '<<' || data === null;
}

module.exports = new Type('tag:yaml.org,2002:merge', {
  kind: 'scalar',
  resolve: resolveYamlMerge
});


/***/ }),

/***/ 7322:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

function resolveYamlNull(data) {
  if (data === null) return true;

  var max = data.length;

  return (max === 1 && data === '~') ||
         (max === 4 && (data === 'null' || data === 'Null' || data === 'NULL'));
}

function constructYamlNull() {
  return null;
}

function isNull(object) {
  return object === null;
}

module.exports = new Type('tag:yaml.org,2002:null', {
  kind: 'scalar',
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function () { return '~';    },
    lowercase: function () { return 'null'; },
    uppercase: function () { return 'NULL'; },
    camelcase: function () { return 'Null'; },
    empty:     function () { return '';     }
  },
  defaultStyle: 'lowercase'
});


/***/ }),

/***/ 6798:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _toString       = Object.prototype.toString;

function resolveYamlOmap(data) {
  if (data === null) return true;

  var objectKeys = [], index, length, pair, pairKey, pairHasKey,
      object = data;

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;

    if (_toString.call(pair) !== '[object Object]') return false;

    for (pairKey in pair) {
      if (_hasOwnProperty.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }

    if (!pairHasKey) return false;

    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }

  return true;
}

function constructYamlOmap(data) {
  return data !== null ? data : [];
}

module.exports = new Type('tag:yaml.org,2002:omap', {
  kind: 'sequence',
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});


/***/ }),

/***/ 3810:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

var _toString = Object.prototype.toString;

function resolveYamlPairs(data) {
  if (data === null) return true;

  var index, length, pair, keys, result,
      object = data;

  result = new Array(object.length);

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];

    if (_toString.call(pair) !== '[object Object]') return false;

    keys = Object.keys(pair);

    if (keys.length !== 1) return false;

    result[index] = [ keys[0], pair[keys[0]] ];
  }

  return true;
}

function constructYamlPairs(data) {
  if (data === null) return [];

  var index, length, pair, keys, result,
      object = data;

  result = new Array(object.length);

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];

    keys = Object.keys(pair);

    result[index] = [ keys[0], pair[keys[0]] ];
  }

  return result;
}

module.exports = new Type('tag:yaml.org,2002:pairs', {
  kind: 'sequence',
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});


/***/ }),

/***/ 5480:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

module.exports = new Type('tag:yaml.org,2002:seq', {
  kind: 'sequence',
  construct: function (data) { return data !== null ? data : []; }
});


/***/ }),

/***/ 4571:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

var _hasOwnProperty = Object.prototype.hasOwnProperty;

function resolveYamlSet(data) {
  if (data === null) return true;

  var key, object = data;

  for (key in object) {
    if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }

  return true;
}

function constructYamlSet(data) {
  return data !== null ? data : {};
}

module.exports = new Type('tag:yaml.org,2002:set', {
  kind: 'mapping',
  resolve: resolveYamlSet,
  construct: constructYamlSet
});


/***/ }),

/***/ 3528:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

module.exports = new Type('tag:yaml.org,2002:str', {
  kind: 'scalar',
  construct: function (data) { return data !== null ? data : ''; }
});


/***/ }),

/***/ 315:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {



var Type = __nccwpck_require__(2008);

var YAML_DATE_REGEXP = new RegExp(
  '^([0-9][0-9][0-9][0-9])'          + // [1] year
  '-([0-9][0-9])'                    + // [2] month
  '-([0-9][0-9])$');                   // [3] day

var YAML_TIMESTAMP_REGEXP = new RegExp(
  '^([0-9][0-9][0-9][0-9])'          + // [1] year
  '-([0-9][0-9]?)'                   + // [2] month
  '-([0-9][0-9]?)'                   + // [3] day
  '(?:[Tt]|[ \\t]+)'                 + // ...
  '([0-9][0-9]?)'                    + // [4] hour
  ':([0-9][0-9])'                    + // [5] minute
  ':([0-9][0-9])'                    + // [6] second
  '(?:\\.([0-9]*))?'                 + // [7] fraction
  '(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
  '(?::([0-9][0-9]))?))?$');           // [11] tz_minute

function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}

function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0,
      delta = null, tz_hour, tz_minute, date;

  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);

  if (match === null) throw new Error('Date resolve error');

  // match: [1] year [2] month [3] day

  year = +(match[1]);
  month = +(match[2]) - 1; // JS month starts with 0
  day = +(match[3]);

  if (!match[4]) { // no hour
    return new Date(Date.UTC(year, month, day));
  }

  // match: [4] hour [5] minute [6] second [7] fraction

  hour = +(match[4]);
  minute = +(match[5]);
  second = +(match[6]);

  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) { // milli-seconds
      fraction += '0';
    }
    fraction = +fraction;
  }

  // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute

  if (match[9]) {
    tz_hour = +(match[10]);
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
    if (match[9] === '-') delta = -delta;
  }

  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));

  if (delta) date.setTime(date.getTime() - delta);

  return date;
}

function representYamlTimestamp(object /*, style*/) {
  return object.toISOString();
}

module.exports = new Type('tag:yaml.org,2002:timestamp', {
  kind: 'scalar',
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});


/***/ }),

/***/ 2973:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MAX_REMOTE_RETRIES = exports.MAX_REMOTE_TIMEOUT_MS = exports.MAX_CONFIG_FILE_BYTES = exports.ECOSYSTEM_OPTIONS = exports.VALID_REMOTE_TOKEN_POLICIES = exports.VALID_MODES = exports.VALID_SEVERITIES = void 0;
exports.splitPatterns = splitPatterns;
exports.normalizeModeInput = normalizeModeInput;
exports.normalizeSeverityInput = normalizeSeverityInput;
exports.normalizeBooleanInput = normalizeBooleanInput;
exports.normalizePositiveIntegerInput = normalizePositiveIntegerInput;
exports.normalizeRemoteTokenPolicyInput = normalizeRemoteTokenPolicyInput;
exports.loadConfig = loadConfig;
exports.loadConfigWithDiagnostics = loadConfigWithDiagnostics;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
const osl_js_yaml_1 = __importDefault(__nccwpck_require__(7942));
exports.VALID_SEVERITIES = ['low', 'medium', 'high'];
exports.VALID_MODES = ['advisory', 'enforce'];
exports.VALID_REMOTE_TOKEN_POLICIES = ['auto', 'never'];
exports.ECOSYSTEM_OPTIONS = {
    go: ['requireGoSum'],
    jvm: ['allowDynamicVersionsWithGradleMetadata'],
    node: ['requireLockfile', 'allowVersionRangesWithLockfile'],
    python: ['requireProjectLockfile', 'requireRequirementHashes'],
    ruby: ['requireLockfile'],
    rust: ['requireLockfile'],
    terraform: ['requireProviderLock']
};
// Defense-in-depth caps. The workflow author controls these inputs in practice,
// but bounding them keeps a misconfigured value from hanging the runner or
// exhausting memory during YAML parsing.
exports.MAX_CONFIG_FILE_BYTES = 1_048_576;
exports.MAX_REMOTE_TIMEOUT_MS = 60_000;
exports.MAX_REMOTE_RETRIES = 10;
function splitPatterns(value) {
    if (!value) {
        return [];
    }
    return value
        .split(/[\n,]/)
        .map((part) => part.trim())
        .filter(Boolean);
}
function normalizeModeInput(value, fallback = 'advisory', key = 'mode') {
    if (value === undefined || value === '') {
        return { value: fallback, diagnostics: [] };
    }
    if (value === 'advisory' || value === 'enforce') {
        return { value, diagnostics: [] };
    }
    return {
        value: fallback,
        diagnostics: [
            {
                message: `Invalid action input ${key} '${String(value)}'; expected one of ${exports.VALID_MODES.join(', ')}. Falling back to ${fallback}.`
            }
        ]
    };
}
function normalizeSeverityInput(value, fallback = 'low', key = 'severity-threshold') {
    if (value === undefined || value === '') {
        return { value: fallback, diagnostics: [] };
    }
    if (isSeverity(value)) {
        return { value, diagnostics: [] };
    }
    return {
        value: fallback,
        diagnostics: [
            {
                message: `Invalid action input ${key} '${String(value)}'; expected one of ${exports.VALID_SEVERITIES.join(', ')}. Falling back to ${fallback}.`
            }
        ]
    };
}
function normalizeBooleanInput(value, key, fallback) {
    if (value === undefined || value === '') {
        return { value: fallback, diagnostics: [] };
    }
    const normalized = value.toLowerCase();
    if (normalized === 'true') {
        return { value: true, diagnostics: [] };
    }
    if (normalized === 'false') {
        return { value: false, diagnostics: [] };
    }
    return {
        value: fallback,
        diagnostics: [
            {
                message: `Invalid action input ${key}; expected boolean true or false. Falling back to ${String(fallback)}.`
            }
        ]
    };
}
function normalizePositiveIntegerInput(value, key, fallback, max) {
    if (value === undefined || value === '') {
        return { value: fallback, diagnostics: [] };
    }
    if (!/^\d+$/.test(value)) {
        return {
            value: fallback,
            diagnostics: [
                {
                    message: `Invalid action input ${key}; expected a non-negative integer. Falling back to ${fallback}.`
                }
            ]
        };
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return {
            value: fallback,
            diagnostics: [
                {
                    message: `Invalid action input ${key}; expected a non-negative integer. Falling back to ${fallback}.`
                }
            ]
        };
    }
    if (max !== undefined && parsed > max) {
        return {
            value: max,
            diagnostics: [
                {
                    message: `Action input ${key} (${parsed}) exceeds maximum ${max}; clamping to ${max}.`
                }
            ]
        };
    }
    return { value: parsed, diagnostics: [] };
}
function normalizeRemoteTokenPolicyInput(value, fallback = 'auto', key = 'remote-token-policy') {
    if (value === undefined || value === '') {
        return { value: fallback, diagnostics: [] };
    }
    if (isRemoteTokenPolicy(value)) {
        return { value, diagnostics: [] };
    }
    return {
        value: fallback,
        diagnostics: [
            {
                message: `Invalid action input ${key} '${String(value)}'; expected one of ${exports.VALID_REMOTE_TOKEN_POLICIES.join(', ')}. Falling back to ${fallback}.`
            }
        ]
    };
}
function loadConfig(root, configPath) {
    return loadConfigWithDiagnostics(root, configPath).config;
}
function loadConfigWithDiagnostics(root, configPath) {
    const resolved = node_path_1.default.resolve(root, configPath);
    // Defense-in-depth: refuse a config path that escapes the scan root.
    const relative = node_path_1.default.relative(root, resolved);
    if (relative.startsWith('..') || node_path_1.default.isAbsolute(relative)) {
        return {
            config: {},
            diagnostics: [
                {
                    message: `Refusing to load config '${configPath}' because it resolves outside the scan root.`
                }
            ]
        };
    }
    if (!node_fs_1.default.existsSync(resolved)) {
        return { config: {}, diagnostics: [] };
    }
    const containment = validateConfigContainment(root, resolved, configPath);
    if (!containment.valid) {
        return { config: {}, diagnostics: containment.diagnostics };
    }
    let stat;
    try {
        stat = node_fs_1.default.statSync(containment.realPath);
    }
    catch (error) {
        return {
            config: {},
            diagnostics: [
                {
                    message: `Unable to stat config '${configPath}': ${error instanceof Error ? error.message : String(error)}.`
                }
            ]
        };
    }
    if (!stat.isFile()) {
        return {
            config: {},
            diagnostics: [
                {
                    message: `Refusing to load config '${configPath}' because it is not a regular file.`
                }
            ]
        };
    }
    if (stat.size > exports.MAX_CONFIG_FILE_BYTES) {
        return {
            config: {},
            diagnostics: [
                {
                    message: `Refusing to load config '${configPath}' (${stat.size} bytes) because it exceeds the ${exports.MAX_CONFIG_FILE_BYTES}-byte limit.`
                }
            ]
        };
    }
    const rawContent = node_fs_1.default.readFileSync(containment.realPath, 'utf8');
    const parsed = parseYamlConfig(rawContent, configPath);
    const diagnostics = [];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        diagnostics.push({
            message: `${configPath} must contain a YAML mapping at the top level; ignoring config.`
        });
        return { config: {}, diagnostics };
    }
    const raw = parsed;
    return {
        config: {
            mode: readMode(raw, diagnostics),
            severityThreshold: readSeverity(raw, 'severity-threshold', diagnostics),
            patch: readBoolean(raw, 'patch', diagnostics),
            remoteValidation: readBoolean(raw, 'remote-validation', diagnostics),
            remoteTokenPolicy: readRemoteTokenPolicy(raw, diagnostics),
            remoteValidationTimeoutMs: readPositiveInteger(raw, 'remote-timeout-ms', diagnostics, exports.MAX_REMOTE_TIMEOUT_MS),
            remoteValidationRetries: readPositiveInteger(raw, 'remote-retries', diagnostics, exports.MAX_REMOTE_RETRIES),
            include: readStringArray(raw, 'include', diagnostics),
            exclude: readStringArray(raw, 'exclude', diagnostics),
            rules: readBooleanRecord(raw, 'rules', diagnostics),
            severityOverrides: readSeverityRecord(raw, diagnostics),
            allowlist: readAllowlist(raw, diagnostics),
            ecosystems: readEcosystems(raw, diagnostics)
        },
        diagnostics
    };
}
function validateConfigContainment(root, resolvedConfigPath, configPath) {
    let realRoot;
    let realConfigPath;
    try {
        realRoot = node_fs_1.default.realpathSync(root);
        realConfigPath = node_fs_1.default.realpathSync(resolvedConfigPath);
    }
    catch (error) {
        return {
            valid: false,
            diagnostics: [
                {
                    message: `Unable to resolve config '${configPath}': ${error instanceof Error ? error.message : String(error)}.`
                }
            ]
        };
    }
    const relative = node_path_1.default.relative(realRoot, realConfigPath);
    if (relative.startsWith('..') || node_path_1.default.isAbsolute(relative)) {
        return {
            valid: false,
            diagnostics: [
                {
                    message: `Refusing to load config '${configPath}' because it resolves outside the scan root.`
                }
            ]
        };
    }
    return { valid: true, realPath: realConfigPath, diagnostics: [] };
}
function parseYamlConfig(content, configPath) {
    try {
        // js-yaml v4's default schema is safe and preserves YAML merge-key behavior
        // that existing policy configs may rely on.
        return osl_js_yaml_1.default.load(content, { schema: osl_js_yaml_1.default.DEFAULT_SCHEMA });
    }
    catch (error) {
        throw new Error(`Unable to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
}
function readMode(raw, diagnostics) {
    const value = raw.mode;
    if (value === undefined) {
        return undefined;
    }
    if (value === 'advisory' || value === 'enforce') {
        return value;
    }
    diagnostics.push({
        message: `Invalid mode '${String(value)}'; expected one of ${exports.VALID_MODES.join(', ')}.`
    });
    return undefined;
}
function readSeverity(raw, key, diagnostics) {
    const value = raw[key];
    if (value === undefined) {
        return undefined;
    }
    if (isSeverity(value)) {
        return value;
    }
    diagnostics.push({
        message: `Invalid ${key} '${String(value)}'; expected one of ${exports.VALID_SEVERITIES.join(', ')}.`
    });
    return undefined;
}
function readRemoteTokenPolicy(raw, diagnostics) {
    const value = raw['remote-token-policy'];
    if (value === undefined) {
        return undefined;
    }
    if (isRemoteTokenPolicy(value)) {
        return value;
    }
    diagnostics.push({
        message: `Invalid remote-token-policy '${String(value)}'; expected one of ${exports.VALID_REMOTE_TOKEN_POLICIES.join(', ')}.`
    });
    return undefined;
}
function readStringArray(raw, key, diagnostics) {
    const value = raw[key];
    if (value === undefined) {
        return undefined;
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
        return value;
    }
    diagnostics.push({
        message: `Invalid ${key}; expected an array of strings.`
    });
    return undefined;
}
function readBoolean(raw, key, diagnostics) {
    const value = raw[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    diagnostics.push({
        message: `Invalid ${key}; expected boolean true or false.`
    });
    return undefined;
}
function readPositiveInteger(raw, key, diagnostics, max) {
    const value = raw[key];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        diagnostics.push({
            message: `Invalid ${key}; expected a non-negative integer.`
        });
        return undefined;
    }
    if (max !== undefined && value > max) {
        diagnostics.push({
            message: `${key} (${value}) exceeds maximum ${max}; clamping to ${max}.`
        });
        return max;
    }
    return value;
}
function readBooleanRecord(raw, key, diagnostics) {
    const value = raw[key];
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        diagnostics.push({
            message: `Invalid ${key}; expected a mapping of names to booleans.`
        });
        return undefined;
    }
    const entries = Object.entries(value).filter(([, enabled]) => {
        const valid = typeof enabled === 'boolean';
        if (!valid) {
            diagnostics.push({
                message: `Invalid ${key} value '${String(enabled)}'; expected boolean true or false.`
            });
        }
        return valid;
    });
    return Object.fromEntries(entries);
}
function readSeverityRecord(raw, diagnostics) {
    const value = raw.severity;
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        diagnostics.push({
            message: 'Invalid severity; expected a mapping of rule ids to severity names.'
        });
        return undefined;
    }
    const entries = Object.entries(value).filter(([, severity]) => {
        const valid = isSeverity(severity);
        if (!valid) {
            diagnostics.push({
                message: `Invalid severity override '${String(severity)}'; expected one of ${exports.VALID_SEVERITIES.join(', ')}.`
            });
        }
        return valid;
    });
    return Object.fromEntries(entries);
}
function readAllowlist(raw, diagnostics) {
    const value = raw.allowlist;
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        diagnostics.push({
            message: 'Invalid allowlist; expected an array of entries.'
        });
        return undefined;
    }
    return value
        .filter((entry) => {
        const valid = isRecord(entry);
        if (!valid) {
            diagnostics.push({
                message: 'Invalid allowlist entry; expected a mapping.'
            });
        }
        return valid;
    })
        .map((entry) => ({ ...entry }));
}
function readEcosystems(raw, diagnostics) {
    const value = raw.ecosystems;
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        diagnostics.push({
            message: 'Invalid ecosystems; expected a mapping of ecosystem names to options.'
        });
        return undefined;
    }
    const ecosystems = {};
    for (const [ecosystem, options] of Object.entries(value)) {
        if (!isRecord(options)) {
            diagnostics.push({
                message: `Invalid ecosystems.${ecosystem}; expected a mapping of option names to booleans.`
            });
            continue;
        }
        const knownOptions = exports.ECOSYSTEM_OPTIONS[ecosystem];
        if (!knownOptions) {
            diagnostics.push({
                message: `Unknown ecosystem '${ecosystem}'; known ecosystems are ${Object.keys(exports.ECOSYSTEM_OPTIONS).join(', ')}.`
            });
            continue;
        }
        const parsedOptions = {};
        for (const [option, optionValue] of Object.entries(options)) {
            if (!knownOptions.includes(option)) {
                diagnostics.push({
                    message: `Unknown option ecosystems.${ecosystem}.${option}; known options are ${knownOptions.join(', ')}.`
                });
                continue;
            }
            if (typeof optionValue !== 'boolean') {
                diagnostics.push({
                    message: `Invalid ecosystems.${ecosystem}.${option}; expected boolean true or false.`
                });
                continue;
            }
            parsedOptions[option] = optionValue;
        }
        ecosystems[ecosystem] = parsedOptions;
    }
    return ecosystems;
}
function isSeverity(value) {
    return typeof value === 'string' && exports.VALID_SEVERITIES.includes(value);
}
function isRemoteTokenPolicy(value) {
    return (typeof value === 'string' && exports.VALID_REMOTE_TOKEN_POLICIES.includes(value));
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}


/***/ }),

/***/ 7242:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SEVERITY_ORDER = exports.DIGEST_PATTERN = exports.SHORT_SHA_PATTERN = exports.SHA_PATTERN = exports.DEFAULT_EXCLUDE = exports.DEFAULT_INCLUDE = void 0;
exports.DEFAULT_INCLUDE = [
    '.github/workflows/**/*.{yml,yaml}',
    'action.{yml,yaml}',
    '**/Dockerfile',
    '**/Dockerfile.*',
    '**/docker-compose*.{yml,yaml}',
    '**/compose*.{yml,yaml}',
    '.devcontainer/devcontainer.json',
    '**/*.tf',
    '**/package.json',
    '**/requirements*.txt',
    '**/pyproject.toml',
    '**/Pipfile',
    '**/go.mod',
    '**/Cargo.toml',
    '**/rust-toolchain.toml',
    '**/rust-toolchain',
    '**/pom.xml',
    '**/build.gradle',
    '**/build.gradle.kts',
    '**/Gemfile'
];
exports.DEFAULT_EXCLUDE = [
    '**/.git/**',
    '**/node_modules/**',
    '**/vendor/**',
    '**/dist/**',
    '**/build/**',
    '**/target/**',
    '**/.terraform/**',
    '**/.venv/**',
    '**/venv/**',
    '**/__pycache__/**'
];
exports.SHA_PATTERN = /^[a-f0-9]{40}$/i;
exports.SHORT_SHA_PATTERN = /^[a-f0-9]{7,39}$/i;
exports.DIGEST_PATTERN = /@sha256:[a-f0-9]{64}\b/i;
exports.SEVERITY_ORDER = {
    low: 0,
    medium: 1,
    high: 2
};


/***/ }),

/***/ 8431:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isSafeWorkspaceRelativePath = isSafeWorkspaceRelativePath;
exports.normalizeWorkspaceRelativePath = normalizeWorkspaceRelativePath;
exports.normalizeLexicalWorkspaceRelativePath = normalizeLexicalWorkspaceRelativePath;
exports.realpathStaysInsideRoot = realpathStaysInsideRoot;
exports.existingAncestorRealpathStaysInsideRoot = existingAncestorRealpathStaysInsideRoot;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
function containsUnsafePathControlCharacter(value) {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}
function isSafeWorkspaceRelativePath(file) {
    if (containsUnsafePathControlCharacter(file) || file.length === 0) {
        return false;
    }
    if (node_path_1.default.isAbsolute(file) || node_path_1.default.win32.isAbsolute(file)) {
        return false;
    }
    return !file
        .replaceAll('\\', '/')
        .split('/')
        .some((segment) => segment === '..');
}
function normalizeWorkspaceRelativePath(root, file) {
    const normalized = normalizeLexicalWorkspaceRelativePath(root, file);
    if (!normalized) {
        return undefined;
    }
    return realpathStaysInsideRoot(root, normalized) ? normalized : undefined;
}
function normalizeLexicalWorkspaceRelativePath(root, file) {
    if (containsUnsafePathControlCharacter(file) || file.length === 0) {
        return undefined;
    }
    if (node_path_1.default.isAbsolute(file) || node_path_1.default.win32.isAbsolute(file)) {
        return undefined;
    }
    const resolvedRoot = node_path_1.default.resolve(root);
    const resolved = node_path_1.default.resolve(resolvedRoot, file);
    const relative = node_path_1.default.relative(resolvedRoot, resolved);
    if (!isContainedRelativePath(relative)) {
        return undefined;
    }
    return relative.split(node_path_1.default.sep).join('/');
}
function realpathStaysInsideRoot(root, file) {
    try {
        const realRoot = node_fs_1.default.realpathSync(root);
        const realTarget = node_fs_1.default.realpathSync(node_path_1.default.join(root, file));
        const relative = node_path_1.default.relative(realRoot, realTarget);
        return relative.length === 0 || isContainedRelativePath(relative);
    }
    catch {
        return false;
    }
}
function existingAncestorRealpathStaysInsideRoot(root, target) {
    let current = target;
    while (!node_fs_1.default.existsSync(current)) {
        const parent = node_path_1.default.dirname(current);
        if (parent === current) {
            return false;
        }
        current = parent;
    }
    try {
        const realRoot = node_fs_1.default.realpathSync(root);
        const realAncestor = node_fs_1.default.realpathSync(current);
        const relative = node_path_1.default.relative(realRoot, realAncestor);
        return relative.length === 0 || isContainedRelativePath(relative);
    }
    catch {
        return false;
    }
}
function isContainedRelativePath(relative) {
    return (relative.length > 0 &&
        relative !== '..' &&
        !relative.startsWith(`..${node_path_1.default.sep}`) &&
        !node_path_1.default.isAbsolute(relative));
}


/***/ }),

/***/ 1066:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sanitizeDisplayValue = sanitizeDisplayValue;
exports.sanitizeFinding = sanitizeFinding;
exports.containsCredentialMaterial = containsCredentialMaterial;
const REDACTED = '[REDACTED]';
const SENSITIVE_QUERY_KEYS = [
    'token',
    'access_token',
    'password',
    'passwd',
    'pwd',
    'secret',
    'client_secret',
    'api_key',
    'apikey',
    'key',
    'auth',
    'authorization',
    'signature',
    'sig'
];
const SENSITIVE_QUERY_PATTERN = new RegExp(`([?&;])([^=&#\\s'"<>)]{1,100})(=)([^&#\\s'"<>)]*)`, 'gi');
function sanitizeDisplayValue(value) {
    return value
        .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/\s'"<>@]+@)/g, `$1${REDACTED}@`)
        .replace(/\b([^/\s'"<>:@]+:[^/\s'"<>@]+@)([A-Za-z0-9.-]+(?::\d+)?\/)/g, `${REDACTED}@$2`)
        .replace(SENSITIVE_QUERY_PATTERN, (match, separator, key, equals) => isSensitiveQueryKey(key) ? `${separator}${key}${equals}${REDACTED}` : match)
        .replace(/\b(Authorization\s*[:=]\s*)(Bearer|Basic)?\s*[^,\s'"<>)}\]]+/gi, (_match, prefix, scheme) => `${prefix}${scheme ? `${scheme} ` : ''}${REDACTED}`)
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
}
function sanitizeFinding(finding) {
    const suggestion = finding.suggestion;
    const replacement = suggestion?.replacement;
    const replacementHasCredentialMaterial = replacement
        ? containsCredentialMaterial(replacement.oldText) ||
            containsCredentialMaterial(replacement.newText)
        : false;
    return {
        ...finding,
        message: sanitizeDisplayValue(finding.message),
        remediation: sanitizeDisplayValue(finding.remediation),
        suggestion: suggestion
            ? {
                ...suggestion,
                title: sanitizeDisplayValue(suggestion.title),
                safeToApply: replacementHasCredentialMaterial ? false : suggestion.safeToApply,
                replacement: replacement
                    ? {
                        ...replacement,
                        oldText: sanitizeDisplayValue(replacement.oldText),
                        newText: sanitizeDisplayValue(replacement.newText)
                    }
                    : undefined
            }
            : undefined
    };
}
function containsCredentialMaterial(value) {
    return sanitizeDisplayValue(value) !== value;
}
function isSensitiveQueryKey(key) {
    const normalized = normalizeQueryKey(key);
    if (SENSITIVE_QUERY_KEYS.includes(normalized)) {
        return true;
    }
    const compact = normalized.replace(/[^a-z0-9]/g, '');
    const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);
    const sensitiveWords = [
        'token',
        'secret',
        'credential',
        'password',
        'passwd',
        'pwd',
        'apikey',
        'auth',
        'authorization',
        'signature',
        'sig'
    ];
    return sensitiveWords.some((word) => compact === word || compact.endsWith(word) || parts.includes(word));
}
function normalizeQueryKey(key) {
    const decoded = safeDecodeURIComponent(key);
    return decoded
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    }
    catch {
        return value;
    }
}


/***/ }),

/***/ 6473:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MAX_REMOTE_REFERENCES = exports.REMOTE_BACKOFF_BASE_MS = exports.DEFAULT_RETRIES = exports.DEFAULT_TIMEOUT_MS = void 0;
exports.validateRemoteReferences = validateRemoteReferences;
exports.githubCommitApiUrl = githubCommitApiUrl;
exports.githubApiBaseUrl = githubApiBaseUrl;
exports.githubServerUrl = githubServerUrl;
exports.githubTokenDecision = githubTokenDecision;
exports.isTrustedGithubApiBaseUrl = isTrustedGithubApiBaseUrl;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
const node_timers_1 = __nccwpck_require__(7997);
const promises_1 = __nccwpck_require__(8500);
const osl_js_yaml_1 = __importDefault(__nccwpck_require__(7942));
const constants_1 = __nccwpck_require__(7242);
const redaction_1 = __nccwpck_require__(1066);
exports.DEFAULT_TIMEOUT_MS = 5000;
exports.DEFAULT_RETRIES = 1;
exports.REMOTE_BACKOFF_BASE_MS = 100;
exports.MAX_REMOTE_REFERENCES = 100;
async function validateRemoteReferences(root, files, config) {
    const references = dedupeRemoteReferences(files.flatMap((file) => collectRemoteReferences(root, file)));
    const cache = new Map();
    const skippedKeys = new Set();
    const findings = [];
    const apiBaseUrl = githubApiBaseUrl();
    const tokenDecision = githubTokenDecision(apiBaseUrl, config);
    const diagnostics = [...tokenDecision.diagnostics];
    for (const reference of references) {
        const key = remoteReferenceKey(reference);
        let result = cache.get(key);
        if (!result) {
            if (cache.size >= exports.MAX_REMOTE_REFERENCES) {
                if (!skippedKeys.has(key)) {
                    skippedKeys.add(key);
                    findings.push(remoteLimitFinding(reference));
                }
                continue;
            }
            result = await validateGithubCommit(reference.owner, reference.repo, reference.sha, config, apiBaseUrl, tokenDecision.headers);
            cache.set(key, result);
        }
        if (result.status === 'missing') {
            findings.push(remoteFinding('remote/github-ref', reference, 'high', `GitHub commit '${reference.sha}' for '${reference.owner}/${reference.repo}' could not be found.`, 'Confirm the repository and commit SHA, or update the reference to an existing immutable commit.'));
        }
        else if (result.status === 'error') {
            findings.push(remoteFinding('remote/validation-error', reference, 'low', `Remote validation for '${reference.owner}/${reference.repo}@${reference.sha}' could not complete: ${result.message}.`, 'Retry later, adjust remote validation timeout/retry settings, or disable remote validation for offline/static-only runs.'));
        }
    }
    if (skippedKeys.size > 0) {
        diagnostics.push({
            message: `Remote validation limited to ${exports.MAX_REMOTE_REFERENCES} unique remote references (from ${cache.size + skippedKeys.size}) to protect CI runtime and API quotas.`
        });
    }
    return { findings, diagnostics };
}
function collectRemoteReferences(root, file) {
    const absolutePath = node_path_1.default.join(root, file);
    const content = node_fs_1.default.readFileSync(absolutePath, 'utf8');
    const serverHost = githubServerHost();
    const references = collectGithubUrlCommitReferences(file, content, serverHost);
    if (/\.ya?ml$/i.test(file) && isWorkflowOrActionFile(file)) {
        references.push(...collectGithubActionCommitReferences(file, content, serverHost));
    }
    return references;
}
function collectGithubActionCommitReferences(file, content, host) {
    const lines = content.split(/\r?\n/);
    const references = parseYamlDocuments(content).flatMap((document) => collectStringProperties(document, 'uses'));
    return references.flatMap((reference) => {
        if (reference.startsWith('./') ||
            reference.startsWith('../') ||
            reference.startsWith('docker://')) {
            return [];
        }
        const atIndex = reference.lastIndexOf('@');
        if (atIndex === -1) {
            return [];
        }
        const sha = reference.slice(atIndex + 1);
        if (!constants_1.SHA_PATTERN.test(sha)) {
            return [];
        }
        const parts = reference.slice(0, atIndex).split('/');
        if (parts.length < 2) {
            return [];
        }
        return [
            {
                host,
                owner: parts[0],
                repo: parts[1],
                sha,
                file,
                line: lineForYamlScalar(lines, 'uses', reference),
                reference
            }
        ];
    });
}
function collectGithubUrlCommitReferences(file, content, host) {
    const references = [];
    const pattern = new RegExp(`${escapeRegExp(host)}[:/]([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+?)(?:\\.git)?(?=[/#?@])(?:[^\\s'"<>)]{0,200})?(?:[?#&]ref=|#|@)([a-f0-9]{40})`, 'gi');
    for (const match of content.matchAll(pattern)) {
        const index = match.index ?? 0;
        references.push({
            host,
            owner: match[1],
            repo: match[2],
            sha: match[3],
            file,
            line: lineNumberAt(content, index),
            reference: match[0]
        });
    }
    return references;
}
async function validateGithubCommit(owner, repo, sha, config, apiBaseUrl, headers) {
    const timeoutMs = config.remoteValidationTimeoutMs ?? exports.DEFAULT_TIMEOUT_MS;
    const retries = config.remoteValidationRetries ?? exports.DEFAULT_RETRIES;
    const url = githubCommitApiUrl(apiBaseUrl, owner, repo, sha);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const result = await fetchGithubCommit(url, timeoutMs, headers);
        if (result.status === 'found' || result.status === 'missing') {
            return result;
        }
        if (attempt === retries) {
            return result;
        }
        await sleep(exports.REMOTE_BACKOFF_BASE_MS * (attempt + 1));
    }
    return { status: 'error', message: 'validation retry loop exited unexpectedly' };
}
function githubCommitApiUrl(apiBaseUrl, owner, repo, sha) {
    return `${apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}`;
}
function githubApiBaseUrl() {
    const apiUrl = process.env.GITHUB_API_URL;
    if (apiUrl) {
        return apiUrl.replace(/\/+$/, '');
    }
    const serverUrl = githubServerUrl();
    if (serverUrl.hostname.toLowerCase() === 'github.com') {
        return 'https://api.github.com';
    }
    return `${serverUrl.origin}/api/v3`;
}
function githubServerHost() {
    return githubServerUrl().host.toLowerCase();
}
function githubServerUrl() {
    const rawUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    try {
        return new URL(rawUrl);
    }
    catch {
        return new URL('https://github.com');
    }
}
async function fetchGithubCommit(url, timeoutMs, headers) {
    const controller = new AbortController();
    const timeout = (0, node_timers_1.setTimeout)(() => controller.abort(), timeoutMs);
    try {
        const response = await globalThis.fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        if (response.status === 200) {
            return { status: 'found' };
        }
        if (response.status === 404) {
            return { status: 'missing' };
        }
        if (response.status === 403 || response.status === 429) {
            return {
                status: 'error',
                message: `GitHub API returned ${response.status} (rate limited or forbidden)`
            };
        }
        if (response.status >= 500) {
            return { status: 'error', message: `GitHub API returned ${response.status}` };
        }
        return { status: 'error', message: `GitHub API returned ${response.status}` };
    }
    catch (error) {
        return {
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
        };
    }
    finally {
        (0, node_timers_1.clearTimeout)(timeout);
    }
}
function githubTokenDecision(apiBaseUrl, config) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'deterministic-deps'
    };
    const token = process.env.GITHUB_TOKEN;
    if (!token || config.remoteTokenPolicy === 'never') {
        return { headers, diagnostics: [] };
    }
    if (isTrustedGithubApiBaseUrl(apiBaseUrl)) {
        headers.Authorization = `Bearer ${token}`;
        return { headers, diagnostics: [] };
    }
    return {
        headers,
        diagnostics: [
            {
                message: `remote-token-policy auto omitted GITHUB_TOKEN for untrusted GitHub API URL '${(0, redaction_1.sanitizeDisplayValue)(apiBaseUrl)}'. Expected HTTPS api.github.com for GitHub.com or an HTTPS host matching GITHUB_SERVER_URL for GitHub Enterprise Server.`
            }
        ]
    };
}
function isTrustedGithubApiBaseUrl(apiBaseUrl) {
    let apiUrl;
    try {
        apiUrl = new URL(apiBaseUrl);
    }
    catch {
        return false;
    }
    if (apiUrl.protocol !== 'https:') {
        return false;
    }
    const serverUrl = githubServerUrl();
    if (serverUrl.hostname.toLowerCase() === 'github.com') {
        return apiUrl.host.toLowerCase() === 'api.github.com';
    }
    return apiUrl.host.toLowerCase() === serverUrl.host.toLowerCase();
}
function remoteFinding(ruleId, reference, severity, message, remediation) {
    return {
        ruleId,
        ecosystem: 'remote',
        file: reference.file,
        line: reference.line,
        severity,
        message: `${message} Reference: '${reference.reference}'.`,
        remediation
    };
}
function remoteLimitFinding(reference) {
    return remoteFinding('remote/validation-error', reference, 'low', `Remote validation for '${reference.owner}/${reference.repo}@${reference.sha}' was skipped because the scan reached the ${exports.MAX_REMOTE_REFERENCES} unique remote reference limit.`, 'Reduce the number of unique remote references, split validation across smaller scans, or disable remote validation for offline/static-only runs.');
}
function dedupeRemoteReferences(references) {
    const seen = new Set();
    return references.filter((reference) => {
        const key = `${reference.file}:${reference.line}:${reference.owner}/${reference.repo}@${reference.sha}`.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function remoteReferenceKey(reference) {
    return `${reference.host}/${reference.owner}/${reference.repo}@${reference.sha}`.toLowerCase();
}
function parseYamlDocuments(content) {
    try {
        // Use js-yaml's safe default schema while preserving YAML merge-key behavior.
        return osl_js_yaml_1.default.loadAll(content, undefined, { schema: osl_js_yaml_1.default.DEFAULT_SCHEMA });
    }
    catch {
        return [];
    }
}
function collectStringProperties(value, property) {
    if (!value || typeof value !== 'object') {
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectStringProperties(entry, property));
    }
    return Object.entries(value).flatMap(([key, entry]) => {
        const current = key === property && typeof entry === 'string' ? [entry] : [];
        return [...current, ...collectStringProperties(entry, property)];
    });
}
function lineForYamlScalar(lines, key, value) {
    const escapedValue = escapeRegExp(value);
    const pattern = new RegExp(`\\b${escapeRegExp(key)}:\\s*['"]?${escapedValue}['"]?`);
    const index = lines.findIndex((line) => pattern.test(line));
    return index === -1 ? 1 : index + 1;
}
function isWorkflowOrActionFile(file) {
    return /^\.github\/workflows\/.+\.ya?ml$/i.test(file) || /(^|\/)action\.ya?ml$/i.test(file);
}
function lineNumberAt(content, index) {
    return content.slice(0, index).split(/\r?\n/).length;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function sleep(milliseconds) {
    return (0, promises_1.setTimeout)(milliseconds);
}


/***/ }),

/***/ 665:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SARIF_FINGERPRINT_VERSION = void 0;
exports.countBySeverity = countBySeverity;
exports.writeReports = writeReports;
exports.renderMarkdown = renderMarkdown;
exports.renderSarif = renderSarif;
exports.renderPatch = renderPatch;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_crypto_1 = __importDefault(__nccwpck_require__(7598));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
const paths_1 = __nccwpck_require__(8431);
const redaction_1 = __nccwpck_require__(1066);
const rules_1 = __nccwpck_require__(5755);
const RULES_HELP_URI = 'https://github.com/bjcorder/deterministic-deps/blob/main/docs/rules.md';
// Stable component of the SARIF fingerprint hash. Changing this value
// invalidates every previously stored fingerprint, so do not bump it casually.
exports.SARIF_FINGERPRINT_VERSION = 'v1';
function countBySeverity(findings) {
    return {
        high: findings.filter((finding) => finding.severity === 'high').length,
        medium: findings.filter((finding) => finding.severity === 'medium').length,
        low: findings.filter((finding) => finding.severity === 'low').length
    };
}
function writeReports(root, findings, writeSarif, writePatch = false) {
    const outputDir = node_path_1.default.join(root, 'deterministic-deps-report');
    if (!(0, paths_1.existingAncestorRealpathStaysInsideRoot)(root, outputDir)) {
        throw new Error('Report output directory must resolve inside the scan root.');
    }
    node_fs_1.default.mkdirSync(outputDir, { recursive: true });
    const markdownPath = node_path_1.default.join(outputDir, 'report.md');
    node_fs_1.default.writeFileSync(markdownPath, renderMarkdown(findings), 'utf8');
    const patchPath = writePatch ? node_path_1.default.join(outputDir, 'suggestions.patch') : undefined;
    if (patchPath) {
        node_fs_1.default.writeFileSync(patchPath, renderPatch(root, findings), 'utf8');
    }
    if (!writeSarif) {
        return { markdownPath, patchPath };
    }
    const sarifPath = node_path_1.default.join(outputDir, 'deterministic-deps.sarif');
    node_fs_1.default.writeFileSync(sarifPath, JSON.stringify(renderSarif(findings), null, 2), 'utf8');
    return { markdownPath, sarifPath, patchPath };
}
function renderMarkdown(findings) {
    const counts = countBySeverity(findings);
    const lines = [
        '# deterministic-deps report',
        '',
        `Total findings: ${findings.length}`,
        '',
        `High: ${counts.high}`,
        `Medium: ${counts.medium}`,
        `Low: ${counts.low}`,
        ''
    ];
    if (findings.length === 0) {
        lines.push('No non-deterministic dependency declarations were found.', '');
        return lines.join('\n');
    }
    lines.push('| Severity | Rule | Ecosystem | Location | Message | Remediation |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const finding of findings) {
        lines.push(`| ${finding.severity} | ${finding.ruleId} | ${finding.ecosystem} | ${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(finding.file))}:${finding.line} | ${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(finding.message))} | ${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(finding.remediation))} |`);
    }
    const suggestions = findings.filter((finding) => finding.suggestion);
    if (suggestions.length > 0) {
        lines.push('', '## Suggestions', '');
        for (const finding of suggestions) {
            const suggestion = finding.suggestion;
            if (!suggestion) {
                continue;
            }
            const replacement = safeReplacement(finding);
            lines.push(`- ${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(finding.file))}:${finding.line} ${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(suggestion.title))} (confidence: ${suggestion.confidence}; safe patch: ${replacement ? 'yes' : 'no'})`);
            if (replacement) {
                lines.push(`  - Replace line ${replacement.line} with: \`${escapeMarkdown((0, redaction_1.sanitizeDisplayValue)(replacement.newText))}\``);
            }
        }
    }
    lines.push('');
    return lines.join('\n');
}
function renderSarif(findings) {
    const rules = Array.from(new Set(findings.map((finding) => finding.ruleId))).map(sarifRuleMetadata);
    return {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'deterministic-deps',
                        informationUri: 'https://github.com/bjcorder/deterministic-deps',
                        rules
                    }
                },
                results: findings.map((finding) => {
                    const result = {
                        ruleId: finding.ruleId,
                        level: sarifLevel(finding.severity),
                        message: {
                            text: (0, redaction_1.sanitizeDisplayValue)(`${finding.message} ${finding.remediation}`)
                        },
                        locations: [
                            {
                                physicalLocation: {
                                    artifactLocation: {
                                        uri: finding.file
                                    },
                                    region: {
                                        startLine: finding.line
                                    }
                                }
                            }
                        ],
                        partialFingerprints: sarifFingerprints(finding),
                        properties: {
                            ecosystem: finding.ecosystem,
                            severity: finding.severity
                        }
                    };
                    const replacement = safeReplacement(finding);
                    if (replacement &&
                        finding.file === replacement.file &&
                        finding.line === replacement.line &&
                        replacement.oldText.length > 0) {
                        result.fixes = [
                            {
                                description: {
                                    text: (0, redaction_1.sanitizeDisplayValue)(finding.suggestion?.title ?? finding.remediation)
                                },
                                artifactChanges: [
                                    {
                                        artifactLocation: {
                                            uri: replacement.file
                                        },
                                        replacements: [
                                            {
                                                deletedRegion: {
                                                    startLine: replacement.line,
                                                    endLine: replacement.line
                                                },
                                                insertedContent: {
                                                    text: `${(0, redaction_1.sanitizeDisplayValue)(replacement.newText)}\n`
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ];
                    }
                    return result;
                })
            }
        ]
    };
}
function sarifRuleMetadata(ruleId) {
    const rule = rules_1.rules.find((candidate) => candidate.id === ruleId);
    const description = rule?.description ?? ruleId;
    return {
        id: ruleId,
        name: ruleId,
        shortDescription: {
            text: description
        },
        fullDescription: {
            text: description
        },
        helpUri: rule ? ruleHelpUri(rule) : RULES_HELP_URI,
        properties: {
            ecosystem: rule?.ecosystem,
            defaultSeverity: rule?.defaultSeverity
        }
    };
}
function ruleHelpUri(rule) {
    return `${RULES_HELP_URI}#${ruleDocsAnchor(rule.ecosystem)}`;
}
function ruleDocsAnchor(ecosystem) {
    const anchors = {
        'github-actions': 'github-actions',
        containers: 'containers',
        terraform: 'terraform-and-opentofu',
        node: 'nodejs',
        python: 'python',
        go: 'go',
        rust: 'rust',
        jvm: 'jvm',
        ruby: 'ruby',
        remote: 'remote-validation'
    };
    return anchors[ecosystem] ?? ecosystem.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
function sarifFingerprints(finding) {
    return {
        primaryLocationLineHash: stableHash([
            'deterministic-deps',
            exports.SARIF_FINGERPRINT_VERSION,
            finding.ruleId,
            finding.file,
            finding.line.toString(),
            (0, redaction_1.sanitizeDisplayValue)(finding.message)
        ].join('\0'))
    };
}
function stableHash(value) {
    return node_crypto_1.default.createHash('sha256').update(value).digest('hex');
}
function renderPatch(root, findings) {
    const replacements = findings
        .map((finding) => safeReplacement(finding))
        .filter((replacement) => Boolean(replacement))
        .map((replacement) => {
        const safeFile = (0, paths_1.normalizeWorkspaceRelativePath)(root, replacement.file);
        if (!safeFile) {
            return undefined;
        }
        return { replacement, safeFile };
    })
        .filter((value) => Boolean(value))
        .filter(({ replacement, safeFile }) => replacementMatchesFile(root, safeFile, replacement));
    if (replacements.length === 0) {
        return '';
    }
    const lines = [];
    for (const { replacement, safeFile } of replacements) {
        lines.push(`diff --git a/${safeFile} b/${safeFile}`, `--- a/${safeFile}`, `+++ b/${safeFile}`, `@@ -${replacement.line},1 +${replacement.line},1 @@`, `-${replacement.oldText}`, `+${replacement.newText}`);
    }
    lines.push('');
    return lines.join('\n');
}
function safeReplacement(finding) {
    const suggestion = finding.suggestion;
    if (!suggestion?.safeToApply || !suggestion.replacement) {
        return undefined;
    }
    if (!(0, paths_1.isSafeWorkspaceRelativePath)(suggestion.replacement.file) ||
        replacementContainsUnsafeLineText(suggestion.replacement) ||
        replacementContainsCredentialMaterial(suggestion.replacement)) {
        return undefined;
    }
    return suggestion.replacement;
}
function replacementContainsCredentialMaterial(replacement) {
    return ((0, redaction_1.containsCredentialMaterial)(replacement.oldText) ||
        (0, redaction_1.containsCredentialMaterial)(replacement.newText));
}
function replacementContainsUnsafeLineText(replacement) {
    return /[\r\n]/.test(replacement.oldText) || /[\r\n]/.test(replacement.newText);
}
function replacementMatchesFile(root, safeFile, replacement) {
    const filePath = node_path_1.default.join(root, safeFile);
    if (!node_fs_1.default.existsSync(filePath)) {
        return false;
    }
    const line = node_fs_1.default.readFileSync(filePath, 'utf8').split(/\r?\n/)[replacement.line - 1];
    return line === replacement.oldText;
}
function sarifLevel(severity) {
    if (severity === 'high') {
        return 'error';
    }
    if (severity === 'medium') {
        return 'warning';
    }
    return 'note';
}
function escapeMarkdown(value) {
    return value.replaceAll('|', '\\|').replaceAll('`', '\\`').replaceAll('\n', ' ');
}


/***/ }),

/***/ 5755:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.rules = void 0;
exports.evaluateFile = evaluateFile;
exports.finalizeFindings = finalizeFindings;
exports.shouldReportFailure = shouldReportFailure;
exports.defaultExcludeMatchers = defaultExcludeMatchers;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
const osl_js_yaml_1 = __importDefault(__nccwpck_require__(7942));
const osl_minimatch_1 = __nccwpck_require__(5468);
const constants_1 = __nccwpck_require__(7242);
const redaction_1 = __nccwpck_require__(1066);
exports.rules = [
    rule('github-actions/sha-pin', 'github-actions', 'high', 'External GitHub Actions references must use full commit SHA refs.', checkGithubActions),
    rule('github-actions/full-sha', 'github-actions', 'high', 'Short GitHub Actions SHAs are rejected because they are not explicit enough.', checkGithubActions),
    rule('github-actions/docker-digest', 'github-actions', 'high', 'Docker action references must include sha256 digests.', checkGithubActions),
    rule('github-actions/versioned-runner', 'github-actions', 'medium', 'GitHub-hosted runner labels should use versioned operating system labels.', checkGithubActions),
    rule('containers/image-digest', 'containers', 'medium', 'Container image references should include immutable sha256 digests.', checkDockerLikeFiles),
    rule('terraform/git-module-sha', 'terraform', 'high', 'Terraform module git sources must use full commit SHA refs.', checkTerraform),
    rule('terraform/provider-lock', 'terraform', 'medium', 'Terraform provider constraints require exact versions or provider lockfiles.', checkTerraform),
    rule('node/lockfile-required', 'node', 'high', 'Node package manifests with dependencies require a package manager lockfile.', checkNode),
    rule('node/lockfile-coverage', 'node', 'medium', 'Node registry dependencies require lockfile entries with integrity metadata.', checkNode),
    rule('node/non-deterministic-spec', 'node', 'medium', 'Node dependencies must avoid ranges, tags, branch refs, and unpinned git specs.', checkNode),
    rule('python/hash-pinned-requirement', 'python', 'medium', 'Requirements entries should use exact pins with hash metadata.', checkPython),
    rule('python/git-sha', 'python', 'high', 'Python git dependencies must pin full commit SHAs.', checkPython),
    rule('python/lockfile-required', 'python', 'high', 'Python project dependency declarations require supported lockfiles.', checkPython),
    rule('go/sum-required', 'go', 'high', 'Go modules require go.sum.', checkGo),
    rule('go/git-replace-sha', 'go', 'medium', 'Go replace directives that use git sources require immutable refs.', checkGo),
    rule('rust/lockfile-required', 'rust', 'high', 'Cargo manifests require Cargo.lock for deterministic application builds.', checkRust),
    rule('rust/git-rev-sha', 'rust', 'high', 'Rust git dependencies must include full rev commit SHAs.', checkRust),
    rule('rust/toolchain-version', 'rust', 'medium', 'Rust toolchain files must avoid floating stable, beta, and nightly channels.', checkRust),
    rule('jvm/dynamic-version', 'jvm', 'medium', 'Maven and Gradle declarations reject dynamic JVM versions unless supported Gradle metadata satisfies policy.', checkJvm),
    rule('ruby/lockfile-required', 'ruby', 'high', 'Gemfiles require Gemfile.lock for deterministic resolution.', checkRuby),
    rule('ruby/git-ref-sha', 'ruby', 'high', 'Ruby git dependencies must pin full ref commit SHAs.', checkRuby),
    rule('remote/github-ref', 'remote', 'high', 'Remote validation reports pinned GitHub commit SHAs that cannot be found.', noFileFindings),
    rule('remote/validation-error', 'remote', 'low', 'Remote validation reports deterministic findings for timeout, rate-limit, authorization, and API errors.', noFileFindings)
];
function evaluateFile(root, file, config, trackedFiles) {
    const absolutePath = node_path_1.default.join(root, file);
    const content = node_fs_1.default.readFileSync(absolutePath, 'utf8');
    const context = {
        root,
        file,
        absolutePath,
        content,
        config,
        lines: content.split(/\r?\n/)
    };
    return uniqueRuleHandlers()
        .flatMap((handler) => handler(context))
        .map((finding) => applySeverityOverride(finding, config))
        .map(redaction_1.sanitizeFinding)
        .filter((finding) => shouldKeepFinding(finding, config, trackedFiles));
}
function finalizeFindings(findings, config, trackedFiles) {
    return findings
        .map((finding) => applySeverityOverride(finding, config))
        .map(redaction_1.sanitizeFinding)
        .filter((finding) => shouldKeepFinding(finding, config, trackedFiles));
}
function shouldKeepFinding(finding, config, trackedFiles) {
    return (config.rules?.[finding.ruleId] !== false &&
        hasRequiredCompanionFile(finding, trackedFiles) &&
        !isAllowlisted(finding, config));
}
function uniqueRuleHandlers() {
    return Array.from(new Set(exports.rules.map((ruleDefinition) => ruleDefinition.evaluate)));
}
function checkGithubActions(context) {
    if (!/\.ya?ml$/i.test(context.file) || !isWorkflowOrActionFile(context.file)) {
        return [];
    }
    const findings = [];
    const documents = parseYamlDocuments(context.content);
    const references = documents.flatMap((document) => collectStringProperties(document, 'uses'));
    const runnerReferences = documents.flatMap((document) => collectGithubActionsRunnerReferences(document, context.lines));
    for (const reference of references) {
        const line = lineForYamlScalar(context.lines, 'uses', reference);
        const findingForReference = checkActionReference(context.file, line, reference);
        if (findingForReference) {
            findings.push(findingForReference);
        }
    }
    for (const runnerReference of runnerReferences) {
        const findingForRunner = checkGithubActionsRunnerLabel(context.file, runnerReference.line, runnerReference.label);
        if (findingForRunner) {
            findings.push(findingForRunner);
        }
    }
    if (documents.length > 0 && (references.length > 0 || runnerReferences.length > 0)) {
        return findings;
    }
    return checkGithubActionsWithLineFallback(context);
}
function checkActionReference(file, line, reference) {
    if (reference.startsWith('./') || reference.startsWith('../')) {
        return undefined;
    }
    if (reference.startsWith('docker://')) {
        if (constants_1.DIGEST_PATTERN.test(reference)) {
            return undefined;
        }
        return finding('github-actions/docker-digest', 'github-actions', file, line, 'high', `Docker action reference '${reference}' is not pinned by digest.`, 'Use a docker:// image reference with an @sha256 digest.');
    }
    const atIndex = reference.lastIndexOf('@');
    if (atIndex === -1) {
        return finding('github-actions/sha-pin', 'github-actions', file, line, 'high', `Action '${reference}' is missing an immutable commit SHA ref.`, 'Pin external actions to a full 40-character commit SHA.');
    }
    const ref = reference.slice(atIndex + 1);
    if (constants_1.SHA_PATTERN.test(ref)) {
        return undefined;
    }
    return finding(constants_1.SHORT_SHA_PATTERN.test(ref) ? 'github-actions/full-sha' : 'github-actions/sha-pin', 'github-actions', file, line, 'high', `Action '${reference}' is pinned to '${ref}', not a full commit SHA.`, 'Replace branch, tag, or short SHA refs with a full 40-character commit SHA.');
}
function checkGithubActionsRunnerLabel(file, line, label) {
    if (!isFloatingGithubHostedRunnerLabel(label)) {
        return undefined;
    }
    return finding('github-actions/versioned-runner', 'github-actions', file, line, 'medium', `GitHub-hosted runner label '${label}' can move to a new image without a workflow change.`, 'Use a versioned runner label such as ubuntu-24.04, windows-2025, or macos-15.');
}
function checkGithubActionsWithLineFallback(context) {
    const findings = [];
    context.lines.forEach((line, index) => {
        const usesMatch = line.match(/\buses:\s*['"]?([^'"\s#]+)['"]?/);
        if (usesMatch) {
            const findingForReference = checkActionReference(context.file, index + 1, usesMatch[1]);
            if (findingForReference) {
                findings.push(findingForReference);
            }
        }
        const runsOnMatch = line.match(/\bruns-on:\s*(.+)$/);
        if (!runsOnMatch) {
            return;
        }
        for (const label of parseFallbackRunsOnLabels(runsOnMatch[1])) {
            const findingForRunner = checkGithubActionsRunnerLabel(context.file, index + 1, label);
            if (findingForRunner) {
                findings.push(findingForRunner);
            }
        }
    });
    return findings;
}
function checkDockerLikeFiles(context) {
    if (!isDockerLikeFile(context.file)) {
        return [];
    }
    if (!isDockerfile(context.file)) {
        return checkStructuredContainerFile(context);
    }
    const findings = [];
    context.lines.forEach((line, index) => {
        const dockerfileMatch = line.match(/^\s*FROM\s+([^\s#]+)/i);
        const image = dockerfileMatch?.[1];
        if (!image || image.toLowerCase() === 'scratch' || image.includes('${')) {
            return;
        }
        const severity = /:latest(?:$|@)/i.test(image) || !image.includes(':') ? 'high' : 'medium';
        if (!constants_1.DIGEST_PATTERN.test(image)) {
            findings.push(finding('containers/image-digest', 'containers', context.file, index + 1, severity, `Container image '${image}' is not pinned by digest.`, 'Use an immutable image reference such as name:tag@sha256:<digest>.'));
        }
    });
    return findings;
}
function checkStructuredContainerFile(context) {
    const references = context.file.endsWith('.json')
        ? collectStringProperties(safeJson(context.content), 'image')
        : parseYamlDocuments(context.content).flatMap((document) => collectStringProperties(document, 'image'));
    return references.flatMap((image) => {
        if (!image || image.toLowerCase() === 'scratch' || image.includes('${')) {
            return [];
        }
        const severity = /:latest(?:$|@)/i.test(image) || !image.includes(':') ? 'high' : 'medium';
        if (constants_1.DIGEST_PATTERN.test(image)) {
            return [];
        }
        return [
            finding('containers/image-digest', 'containers', context.file, lineForYamlScalar(context.lines, 'image', image), severity, `Container image '${image}' is not pinned by digest.`, 'Use an immutable image reference such as name:tag@sha256:<digest>.')
        ];
    });
}
function checkTerraform(context) {
    if (!context.file.endsWith('.tf')) {
        return [];
    }
    const findings = [];
    const hasTerraformLock = node_fs_1.default.existsSync(node_path_1.default.join(node_path_1.default.dirname(context.absolutePath), '.terraform.lock.hcl'));
    const blocks = terraformBlocks(context);
    for (const block of blocks.filter((entry) => entry.type === 'module')) {
        for (const line of block.lines) {
            const sourceMatch = line.text.match(/\bsource\s*=\s*"([^"]+)"/);
            if (!sourceMatch || !isGitReference(sourceMatch[1]) || hasCommitQuery(sourceMatch[1])) {
                continue;
            }
            findings.push(finding('terraform/git-module-sha', 'terraform', context.file, line.number, 'high', `Terraform module source '${sourceMatch[1]}' does not pin a commit SHA.`, 'Add ?ref=<40-character commit SHA> to git module sources.'));
        }
    }
    for (const block of blocks.filter(isTerraformProviderBlock)) {
        for (const line of block.lines) {
            const versionMatch = line.text.match(/\bversion\s*=\s*"([^"]+)"/);
            if (!versionMatch ||
                hasTerraformLock ||
                isExactVersion(versionMatch[1]) ||
                !ecosystemBoolean(context.config, 'terraform', 'requireProviderLock', true)) {
                continue;
            }
            findings.push(finding('terraform/provider-lock', 'terraform', context.file, line.number, 'medium', `Terraform provider constraint '${versionMatch[1]}' is not exact and no .terraform.lock.hcl was found.`, 'Commit .terraform.lock.hcl or use exact provider versions.'));
        }
    }
    if (blocks.length > 0) {
        return findings;
    }
    context.lines.forEach((line, index) => {
        const stripped = stripTerraformComment(line);
        const sourceMatch = stripped.match(/\bsource\s*=\s*"([^"]+)"/);
        if (sourceMatch && isGitReference(sourceMatch[1]) && !hasCommitQuery(sourceMatch[1])) {
            findings.push(finding('terraform/git-module-sha', 'terraform', context.file, index + 1, 'high', `Terraform module source '${sourceMatch[1]}' does not pin a commit SHA.`, 'Add ?ref=<40-character commit SHA> to git module sources.'));
        }
        const versionMatch = stripped.match(/\bversion\s*=\s*"([^"]+)"/);
        if (versionMatch &&
            !hasTerraformLock &&
            !isExactVersion(versionMatch[1]) &&
            ecosystemBoolean(context.config, 'terraform', 'requireProviderLock', true)) {
            findings.push(finding('terraform/provider-lock', 'terraform', context.file, index + 1, 'medium', `Terraform provider constraint '${versionMatch[1]}' is not exact and no .terraform.lock.hcl was found.`, 'Commit .terraform.lock.hcl or use exact provider versions.'));
        }
    });
    return findings;
}
function checkNode(context) {
    if (!context.file.endsWith('package.json')) {
        return [];
    }
    const findings = [];
    const directory = node_path_1.default.dirname(context.absolutePath);
    const lockfiles = readNodeLockfiles(directory);
    const hasLock = lockfiles.length > 0;
    const json = safeJson(context.content);
    if (!json) {
        return [];
    }
    const entries = nodeDependencyEntries(json, context.lines);
    if (!hasLock &&
        entries.some((entry) => entry.section !== 'packageManager') &&
        ecosystemBoolean(context.config, 'node', 'requireLockfile', true)) {
        findings.push(finding('node/lockfile-required', 'node', context.file, 1, 'high', 'package.json declares dependencies but no npm, Yarn, or pnpm lockfile was found.', 'Commit package-lock.json, npm-shrinkwrap.json, yarn.lock, or pnpm-lock.yaml.'));
    }
    for (const entry of entries) {
        const deterministic = isNodeSpecDeterministic(entry.spec);
        const registrySpec = isNodeRegistryVersionSpec(entry.spec);
        const rangesAllowedWithLock = hasLock &&
            registrySpec &&
            ecosystemBoolean(context.config, 'node', 'allowVersionRangesWithLockfile', false);
        if (!deterministic && !rangesAllowedWithLock) {
            findings.push(finding('node/non-deterministic-spec', 'node', context.file, entry.line, 'medium', `${entry.section} dependency '${entry.name}' uses non-deterministic spec '${entry.spec}'.`, 'Use exact versions with lockfile coverage, workspace/file links, or immutable git and URL references.'));
            continue;
        }
        if (hasLock && registrySpec && !hasNodeLockCoverage(entry, lockfiles)) {
            findings.push(finding('node/lockfile-coverage', 'node', context.file, entry.line, 'medium', `${entry.section} dependency '${entry.name}' is not covered by a lockfile entry with integrity metadata.`, 'Regenerate and commit the npm, Yarn, or pnpm lockfile so registry dependencies include resolved integrity.'));
        }
    }
    return findings;
}
function checkPython(context) {
    if (!isPythonFile(context.file)) {
        return [];
    }
    if (context.file.endsWith('pyproject.toml') || context.file.endsWith('Pipfile')) {
        return checkPythonProjectFile(context);
    }
    const findings = [];
    for (const requirement of parseRequirementsEntries(context.lines)) {
        if (isPythonGitDependency(requirement.text) && !hasCommitReference(requirement.text)) {
            findings.push(finding('python/git-sha', 'python', context.file, requirement.line, 'high', `Python git dependency '${requirement.text}' is not pinned to a commit SHA.`, 'Use @<40-character commit SHA> for git dependencies.'));
            continue;
        }
        if (ecosystemBoolean(context.config, 'python', 'requireRequirementHashes', true) &&
            isHashableRequirement(requirement.text) &&
            (!isExactPythonRequirement(requirement.text) || !requirement.hasHash)) {
            findings.push(finding('python/hash-pinned-requirement', 'python', context.file, requirement.line, 'medium', `Requirement '${requirement.text}' is not exactly pinned with a hash.`, 'Use exact == pins and --hash entries, for example from pip-compile --generate-hashes.'));
        }
    }
    return findings;
}
function checkPythonProjectFile(context) {
    const findings = [];
    const directory = node_path_1.default.dirname(context.absolutePath);
    const locks = ['poetry.lock', 'uv.lock', 'Pipfile.lock'];
    const dependencies = context.file.endsWith('Pipfile')
        ? parsePipfileDependencyEntries(context.lines)
        : parsePyprojectDependencyEntries(context.lines);
    if (dependencies.length > 0 &&
        ecosystemBoolean(context.config, 'python', 'requireProjectLockfile', true) &&
        !locks.some((lock) => node_fs_1.default.existsSync(node_path_1.default.join(directory, lock)))) {
        findings.push(finding('python/lockfile-required', 'python', context.file, 1, 'high', `${node_path_1.default.basename(context.file)} was found without poetry.lock, uv.lock, or Pipfile.lock.`, 'Commit the ecosystem lockfile for Python project dependency declarations.'));
    }
    for (const dependency of dependencies) {
        if (!isPythonGitDependency(dependency.text) || hasCommitReference(dependency.text)) {
            continue;
        }
        findings.push(finding('python/git-sha', 'python', context.file, dependency.line, 'high', `Python ${dependency.source} dependency '${dependency.text}' is not pinned to a commit SHA.`, 'Use a full 40-character commit SHA for git dependencies.'));
    }
    return findings;
}
function parseRequirementsEntries(lines) {
    const entries = [];
    let active = '';
    let activeLine = 1;
    lines.forEach((line, index) => {
        const withoutComment = stripPythonComment(line).trim();
        if (!withoutComment) {
            return;
        }
        const continued = /\\\s*$/.test(withoutComment);
        const segment = withoutComment.replace(/\\\s*$/, '').trim();
        if (!active) {
            activeLine = index + 1;
        }
        active = [active, segment].filter(Boolean).join(' ');
        if (continued) {
            return;
        }
        const normalized = active.replace(/\s+/g, ' ').trim();
        active = '';
        if (isRequirementsOptionOnly(normalized)) {
            return;
        }
        entries.push({
            source: 'requirements',
            text: normalized,
            line: activeLine,
            hasHash: /(?:^|\s)--hash[=\s]/.test(normalized),
            editable: /^(-e|--editable)(?:\s|=)/.test(normalized)
        });
    });
    if (active) {
        entries.push({
            source: 'requirements',
            text: active.replace(/\s+/g, ' ').trim(),
            line: activeLine,
            hasHash: /(?:^|\s)--hash[=\s]/.test(active)
        });
    }
    return entries;
}
function parsePyprojectDependencyEntries(lines) {
    const entries = [];
    let section = '';
    let multilineArray;
    lines.forEach((line, index) => {
        const trimmed = stripPythonComment(line).trim();
        if (!trimmed) {
            return;
        }
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            section = sectionMatch[1];
            return;
        }
        if (multilineArray) {
            multilineArray.text += ` ${trimmed}`;
            if (trimmed.includes(']')) {
                entries.push(...pythonArrayEntries(multilineArray.text, multilineArray.source, multilineArray.line));
                multilineArray = undefined;
            }
            return;
        }
        if (section === 'project' || section.startsWith('project.optional-dependencies')) {
            const arrayMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(\[.*)$/);
            if (arrayMatch &&
                (arrayMatch[1] === 'dependencies' || section.includes('optional-dependencies'))) {
                if (arrayMatch[2].includes(']')) {
                    entries.push(...pythonArrayEntries(arrayMatch[2], section, index + 1));
                }
                else {
                    multilineArray = { source: section, line: index + 1, text: arrayMatch[2] };
                }
            }
            return;
        }
        if (isPoetryDependencySection(section)) {
            const dependency = parseTomlDependencyAssignment(trimmed, section, index + 1);
            if (dependency) {
                entries.push(dependency);
            }
        }
    });
    return entries;
}
function parsePipfileDependencyEntries(lines) {
    const entries = [];
    let section = '';
    lines.forEach((line, index) => {
        const trimmed = stripPythonComment(line).trim();
        if (!trimmed) {
            return;
        }
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            section = sectionMatch[1];
            return;
        }
        if (section !== 'packages' && section !== 'dev-packages') {
            return;
        }
        const dependency = parseTomlDependencyAssignment(trimmed, `Pipfile ${section}`, index + 1);
        if (dependency) {
            entries.push(dependency);
        }
    });
    return entries;
}
function parseTomlDependencyAssignment(line, source, lineNumber) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) {
        return undefined;
    }
    return {
        source,
        text: `${match[1]} = ${match[2].trim()}`,
        line: lineNumber
    };
}
function pythonArrayEntries(arrayText, source, fallbackLine) {
    return Array.from(arrayText.matchAll(/["']([^"']+)["']/g), (match) => ({
        source,
        text: match[1],
        line: fallbackLine
    }));
}
function isPoetryDependencySection(section) {
    return (section === 'tool.poetry.dependencies' ||
        section === 'tool.poetry.dev-dependencies' ||
        /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section));
}
function stripPythonComment(line) {
    let quote;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if ((current === '"' || current === "'") && previous !== '\\') {
            quote = quote === current ? undefined : current;
            continue;
        }
        if (!quote && current === '#') {
            const previousCharacter = line[index - 1];
            if (!previousCharacter || /\s/.test(previousCharacter)) {
                return line.slice(0, index);
            }
        }
    }
    return line;
}
function isRequirementsOptionOnly(requirement) {
    return (/^(-r|--requirement|-c|--constraint)(?:\s|=)/.test(requirement) ||
        /^--(?:index-url|extra-index-url|find-links|trusted-host|no-index|pre)(?:\s|=|$)/.test(requirement));
}
function isPythonGitDependency(requirement) {
    return (isGitReference(requirement) ||
        /\bgit\+/.test(requirement) ||
        /\bgit\s*=/.test(requirement) ||
        /\bvcs\s*=\s*["']git["']/.test(requirement));
}
function isHashableRequirement(requirement) {
    return (!/^(-e|--editable)(?:\s|=)/.test(requirement) &&
        !isPythonGitDependency(requirement) &&
        !/\s@\s*(?:https?:|file:|git\+)/.test(requirement) &&
        /[<>=~!]=/.test(requirement));
}
function isExactPythonRequirement(requirement) {
    return /(^|[A-Za-z0-9_.\]-])==[^=]/.test(requirement);
}
function checkGo(context) {
    if (!context.file.endsWith('go.mod')) {
        return [];
    }
    const findings = [];
    const directory = node_path_1.default.dirname(context.absolutePath);
    if (!node_fs_1.default.existsSync(node_path_1.default.join(directory, 'go.sum')) &&
        ecosystemBoolean(context.config, 'go', 'requireGoSum', true)) {
        findings.push(finding('go/sum-required', 'go', context.file, 1, 'high', 'go.mod was found without go.sum.', 'Commit go.sum so module checksums are locked.'));
    }
    for (const directive of parseGoModDirectives(context.lines)) {
        if (directive.keyword === 'replace' &&
            isGitReference(directive.text) &&
            !hasCommitReference(directive.text) &&
            !hasGoPseudoVersion(directive.text)) {
            findings.push(finding('go/git-replace-sha', 'go', context.file, directive.line, 'medium', `Go replace directive '${directive.text}' does not pin a commit SHA.`, 'Use immutable pseudo-versions or commit SHA refs for git replacements.'));
        }
    }
    return findings;
}
function parseGoModDirectives(lines) {
    const directives = [];
    let blockKeyword;
    lines.forEach((line, index) => {
        const stripped = stripGoModComment(line).trim();
        if (!stripped) {
            return;
        }
        if (blockKeyword) {
            if (stripped === ')') {
                blockKeyword = undefined;
                return;
            }
            directives.push({
                keyword: blockKeyword,
                text: `${blockKeyword} ${stripped}`,
                line: index + 1
            });
            return;
        }
        const blockMatch = stripped.match(/^(require|replace|exclude)\s*\($/);
        if (blockMatch) {
            blockKeyword = blockMatch[1];
            return;
        }
        const directiveMatch = stripped.match(/^(module|go|toolchain|require|replace|exclude|retract)\b(.*)$/);
        if (directiveMatch) {
            directives.push({
                keyword: directiveMatch[1],
                text: stripped,
                line: index + 1
            });
        }
    });
    return directives;
}
function stripGoModComment(line) {
    let quote;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if (current === '"' && previous !== '\\') {
            quote = quote ? undefined : '"';
            continue;
        }
        if (!quote && current === '/' && line[index + 1] === '/') {
            return line.slice(0, index);
        }
    }
    return line;
}
function hasGoPseudoVersion(value) {
    return /\bv\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-\d{14}-[a-f0-9]{12}\b/i.test(value);
}
function checkRust(context) {
    if (isRustToolchainFile(context.file)) {
        return checkRustToolchain(context);
    }
    if (!context.file.endsWith('Cargo.toml')) {
        return [];
    }
    const findings = [];
    const directory = node_path_1.default.dirname(context.absolutePath);
    if (!node_fs_1.default.existsSync(node_path_1.default.join(directory, 'Cargo.lock')) &&
        ecosystemBoolean(context.config, 'rust', 'requireLockfile', true)) {
        findings.push(finding('rust/lockfile-required', 'rust', context.file, 1, 'high', 'Cargo.toml was found without Cargo.lock.', 'Commit Cargo.lock for applications and workspaces that need deterministic builds.'));
    }
    for (const dependency of parseRustDependencyEntries(context.lines)) {
        if (/\bgit\s*=/.test(dependency.text) &&
            !/\brev\s*=\s*["'][a-f0-9]{40}["']/i.test(dependency.text)) {
            const suggestion = rustRevSuggestion(context.file, dependency);
            findings.push(finding('rust/git-rev-sha', 'rust', context.file, dependency.line, 'high', `Rust git dependency '${dependency.text}' does not pin a rev commit SHA.`, 'Add rev = "<40-character commit SHA>" to git dependencies.', suggestion));
        }
    }
    return findings;
}
function checkRustToolchain(context) {
    const channel = parseRustToolchainTomlChannel(context.lines) ??
        (isLegacyRustToolchainFile(context.file)
            ? parseLegacyRustToolchainChannel(context.lines)
            : undefined);
    if (!channel || !isFloatingRustToolchainChannel(channel.value)) {
        return [];
    }
    return [
        finding('rust/toolchain-version', 'rust', context.file, channel.line, 'medium', `Rust toolchain channel '${channel.value}' can change over time.`, 'Pin the Rust toolchain to an exact version such as "1.78.0" or a dated channel such as "nightly-2024-05-01".')
    ];
}
function parseRustToolchainTomlChannel(lines) {
    let section = '';
    for (let index = 0; index < lines.length; index += 1) {
        const stripped = stripTomlComment(lines[index]).trim();
        if (!stripped) {
            continue;
        }
        const sectionMatch = stripped.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            section = sectionMatch[1].trim();
            continue;
        }
        if (section !== 'toolchain') {
            continue;
        }
        const assignment = stripped.match(/^channel\s*=\s*(.+)$/);
        if (!assignment) {
            continue;
        }
        const value = normalizeTomlScalar(assignment[1]);
        return value ? { value, line: index + 1 } : undefined;
    }
    return undefined;
}
function parseLegacyRustToolchainChannel(lines) {
    const entries = lines
        .map((line, index) => ({
        text: stripTomlComment(line).trim(),
        line: index + 1
    }))
        .filter((entry) => entry.text.length > 0);
    if (entries.length !== 1 || entries[0].text.startsWith('[') || entries[0].text.includes('=')) {
        return undefined;
    }
    const value = normalizeTomlScalar(entries[0].text);
    return value ? { value, line: entries[0].line } : undefined;
}
function normalizeTomlScalar(value) {
    const trimmed = value.trim().replace(/,$/, '').trim();
    const quoted = trimmed.match(/^(['"])(.*)\1$/);
    if (quoted) {
        return quoted[2].trim();
    }
    return /^[A-Za-z0-9_.+-]+$/.test(trimmed) ? trimmed : undefined;
}
function isFloatingRustToolchainChannel(value) {
    const normalized = value.trim().toLowerCase();
    const channel = normalized.match(/^(stable|beta|nightly)(?:-(.+))?$/);
    if (!channel) {
        return false;
    }
    const qualifier = channel[2];
    return !qualifier || !/^\d{4}-\d{2}-\d{2}(?:-.+)?$/.test(qualifier);
}
function parseRustDependencyEntries(lines) {
    const entries = [];
    let section = '';
    let active;
    let activeSubtable;
    function finishSubtable() {
        if (activeSubtable) {
            entries.push(activeSubtable);
            activeSubtable = undefined;
        }
    }
    lines.forEach((line, index) => {
        const stripped = stripTomlComment(line).trim();
        if (!stripped) {
            return;
        }
        const sectionMatch = stripped.match(/^\[([^\]]+)\]$/);
        if (sectionMatch && !active) {
            finishSubtable();
            section = sectionMatch[1];
            if (isRustDependencySubtable(section)) {
                activeSubtable = {
                    name: rustDependencySubtableName(section),
                    text: '',
                    line: index + 1
                };
            }
            return;
        }
        if (active) {
            active.text = `${active.text} ${stripped}`.replace(/\s+/g, ' ');
            active.braceDepth += braceDelta(stripped);
            if (active.braceDepth <= 0) {
                entries.push({
                    name: active.name,
                    text: active.text,
                    line: active.line
                });
                active = undefined;
            }
            return;
        }
        if (activeSubtable) {
            activeSubtable.text = `${activeSubtable.text} ${stripped}`.trim().replace(/\s+/g, ' ');
            if (/^git\s*=/.test(stripped)) {
                activeSubtable.line = index + 1;
            }
            return;
        }
        if (!isRustDependencySection(section)) {
            return;
        }
        const assignment = stripped.match(/^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
        if (!assignment) {
            return;
        }
        const text = stripped.replace(/\s+/g, ' ');
        const depth = braceDelta(stripped);
        if (depth > 0) {
            active = {
                name: assignment[1],
                text,
                line: index + 1,
                braceDepth: depth
            };
            return;
        }
        entries.push({
            name: assignment[1],
            text,
            line: index + 1,
            lineText: line
        });
    });
    finishSubtable();
    return entries;
}
function rustRevSuggestion(file, dependency) {
    if (!dependency.lineText || dependency.text.includes('#')) {
        return undefined;
    }
    const sha = /(?:[?&]rev=|#)([a-f0-9]{40})/i.exec(dependency.text)?.[1];
    if (!sha || !/}\s*$/.test(dependency.lineText)) {
        return undefined;
    }
    const newText = dependency.lineText.replace(/\s*}\s*$/, `, rev = "${sha}" }`);
    if (newText === dependency.lineText) {
        return undefined;
    }
    return {
        title: `Add explicit Cargo rev '${sha}' from the existing git URL.`,
        confidence: 'high',
        safeToApply: true,
        replacement: {
            file,
            line: dependency.line,
            oldText: dependency.lineText,
            newText
        }
    };
}
function isRustDependencySection(section) {
    const path = splitTomlDottedPath(section);
    if (!path) {
        return false;
    }
    return (isRustDependencyRoot(path[0]) ||
        (path[0] === 'workspace' && path[1] === 'dependencies' && path.length === 2) ||
        (path[0] === 'target' && path.length >= 3 && isRustDependencyRoot(path[path.length - 1])) ||
        (path[0] === 'patch' && path.length === 2) ||
        (path[0] === 'replace' && path.length === 1));
}
function isRustDependencySubtable(section) {
    const path = splitTomlDottedPath(section);
    if (!path) {
        return false;
    }
    return ((isRustDependencyRoot(path[0]) && path.length >= 2) ||
        (path[0] === 'workspace' && path[1] === 'dependencies' && path.length >= 3) ||
        (path[0] === 'target' && path.length >= 4 && isRustDependencyRoot(path[path.length - 2])) ||
        (path[0] === 'patch' && path.length >= 3));
}
function isRustDependencyRoot(segment) {
    return (segment === 'dependencies' || segment === 'dev-dependencies' || segment === 'build-dependencies');
}
function rustDependencySubtableName(section) {
    const path = splitTomlDottedPath(section);
    return path?.[path.length - 1] ?? section.slice(section.lastIndexOf('.') + 1);
}
function splitTomlDottedPath(section) {
    const segments = [];
    let current = '';
    let quote;
    let escaped = false;
    for (let index = 0; index < section.length; index += 1) {
        const character = section[index];
        if (quote) {
            if (escaped) {
                current += character;
                escaped = false;
                continue;
            }
            if (quote === '"' && character === '\\') {
                escaped = true;
                continue;
            }
            if (character === quote) {
                quote = undefined;
                continue;
            }
            current += character;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '.') {
            if (!current) {
                return undefined;
            }
            segments.push(current);
            current = '';
            continue;
        }
        if (/\s/.test(character)) {
            continue;
        }
        current += character;
    }
    if (quote || escaped || !current) {
        return undefined;
    }
    segments.push(current);
    return segments;
}
function stripTomlComment(line) {
    let quote;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if ((current === '"' || current === "'") && previous !== '\\') {
            quote = quote === current ? undefined : current;
            continue;
        }
        if (!quote && current === '#') {
            return line.slice(0, index);
        }
    }
    return line;
}
function checkJvm(context) {
    if (!/(pom\.xml|build\.gradle|build\.gradle\.kts)$/.test(context.file)) {
        return [];
    }
    const entries = context.file.endsWith('pom.xml')
        ? parseMavenDynamicVersionEntries(context)
        : parseGradleDynamicVersionEntries(context);
    const gradleMetadataSatisfiesPolicy = !context.file.endsWith('pom.xml') &&
        ecosystemBoolean(context.config, 'jvm', 'allowDynamicVersionsWithGradleMetadata', true) &&
        hasGradleLockOrVerificationMetadata(context);
    if (gradleMetadataSatisfiesPolicy) {
        return [];
    }
    return entries.map((entry) => finding('jvm/dynamic-version', 'jvm', context.file, entry.line, 'medium', `${entry.source === 'maven' ? 'Maven' : 'Gradle'} version declaration '${entry.text}' resolves to dynamic version '${entry.version}'.`, entry.source === 'gradle'
        ? 'Use fixed release versions or commit Gradle dependency locking or verification metadata.'
        : 'Use fixed release versions for Maven dependency, parent, plugin, and version-property declarations.'));
}
function parseMavenDynamicVersionEntries(context) {
    const content = stripXmlComments(context.content);
    const propertyReferences = new Set();
    const entries = [];
    for (const block of matchXmlBlocks(content, ['dependency', 'parent', 'plugin'])) {
        for (const versionTag of matchXmlChildText(block.text, 'version')) {
            const version = normalizeXmlText(versionTag.value);
            collectMavenPropertyReferences(version).forEach((property) => propertyReferences.add(property));
            if (isJvmDynamicVersion(version)) {
                entries.push({
                    source: 'maven',
                    text: versionTag.text,
                    version,
                    line: lineNumberAt(content, block.index + versionTag.index)
                });
            }
        }
    }
    for (const propertiesBlock of matchXmlBlocks(content, ['properties'])) {
        const bodyStart = propertiesBlock.text.indexOf('>') + 1;
        const body = propertiesBlock.text.slice(bodyStart, propertiesBlock.text.lastIndexOf('</'));
        for (const property of matchXmlProperties(body)) {
            const version = normalizeXmlText(property.value);
            if (propertyReferences.has(property.name) && isJvmDynamicVersion(version)) {
                entries.push({
                    source: 'maven',
                    text: property.text,
                    version,
                    line: lineNumberAt(content, propertiesBlock.index + bodyStart + property.index)
                });
            }
        }
    }
    return dedupeJvmEntries(entries);
}
function parseGradleDynamicVersionEntries(context) {
    return stripGradleComments(context.content)
        .split(/\r?\n/)
        .flatMap((line, index) => parseGradleLineVersions(line, index + 1))
        .filter((entry) => isJvmDynamicVersion(entry.version));
}
function parseGradleLineVersions(line, lineNumber) {
    const trimmed = line.trim();
    if (!isGradleDependencyOrPluginDeclaration(trimmed)) {
        return [];
    }
    const entries = [];
    const quotedValues = Array.from(trimmed.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]);
    for (const value of quotedValues) {
        const version = extractGradleCoordinateVersion(value);
        if (version) {
            entries.push({
                source: 'gradle',
                text: trimmed,
                version,
                line: lineNumber
            });
        }
    }
    for (const match of trimmed.matchAll(/\bversion\s*[:=]\s*['"]([^'"]+)['"]/g)) {
        entries.push({
            source: 'gradle',
            text: trimmed,
            version: match[1],
            line: lineNumber
        });
    }
    const pluginVersion = /\bversion\s+['"]([^'"]+)['"]/.exec(trimmed)?.[1];
    if (pluginVersion) {
        entries.push({
            source: 'gradle',
            text: trimmed,
            version: pluginVersion,
            line: lineNumber
        });
    }
    return dedupeJvmEntries(entries);
}
function isGradleDependencyOrPluginDeclaration(line) {
    return (/^(api|annotationProcessor|classpath|compile|compileOnly|debugImplementation|detachedConfiguration|implementation|kapt|ksp|runtime|runtimeOnly|testAnnotationProcessor|testCompile|testImplementation|testRuntime|testRuntimeOnly)\b/.test(line) ||
        /^(add|constraints|enforcedPlatform|platform)\s*\(/.test(line) ||
        /^id\s*(?:\(|['"])/.test(line));
}
function extractGradleCoordinateVersion(value) {
    const parts = value.split(':');
    if (parts.length < 3) {
        return undefined;
    }
    return parts[parts.length - 1];
}
function isJvmDynamicVersion(version) {
    const trimmed = version.trim();
    return (/\bSNAPSHOT\b/i.test(trimmed) ||
        /^latest(?:[.-][\w-]+)?$/i.test(trimmed) ||
        /\+$/.test(trimmed) ||
        /^[[(][^,]*,[^\])]*[\])]$/.test(trimmed));
}
function stripXmlComments(content) {
    return content.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' '));
}
function matchXmlBlocks(content, names) {
    return names.flatMap((name) => Array.from(content.matchAll(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'gi')), (match) => ({
        text: match[0],
        index: match.index ?? 0
    })));
}
function matchXmlChildText(content, name) {
    return Array.from(content.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi')), (match) => ({
        text: match[0].trim(),
        value: match[1],
        index: match.index ?? 0
    }));
}
function matchXmlProperties(content) {
    return Array.from(content.matchAll(/<([A-Za-z0-9_.-]+)\b[^>]*>([\s\S]*?)<\/\1>/g), (match) => ({
        name: match[1],
        text: match[0].trim(),
        value: match[2],
        index: match.index ?? 0
    }));
}
function normalizeXmlText(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function collectMavenPropertyReferences(value) {
    return Array.from(value.matchAll(/\$\{([^}]+)\}/g), (match) => match[1]);
}
function stripGradleComments(content) {
    let result = '';
    let quote;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < content.length; index += 1) {
        const current = content[index];
        const next = content[index + 1];
        const previous = content[index - 1];
        if (lineComment) {
            if (current === '\n' || current === '\r') {
                lineComment = false;
                result += current;
            }
            else {
                result += ' ';
            }
            continue;
        }
        if (blockComment) {
            if (current === '*' && next === '/') {
                result += '  ';
                blockComment = false;
                index += 1;
            }
            else {
                result += current === '\n' || current === '\r' ? current : ' ';
            }
            continue;
        }
        if (!quote && current === '/' && next === '/') {
            result += '  ';
            lineComment = true;
            index += 1;
            continue;
        }
        if (!quote && current === '/' && next === '*') {
            result += '  ';
            blockComment = true;
            index += 1;
            continue;
        }
        if ((current === '"' || current === "'") && previous !== '\\') {
            quote = quote === current ? undefined : current;
        }
        result += current;
    }
    return result;
}
function hasGradleLockOrVerificationMetadata(context) {
    let current = node_path_1.default.dirname(context.absolutePath);
    const root = node_path_1.default.resolve(context.root);
    while (isPathWithinOrEqual(root, current)) {
        if (node_fs_1.default.existsSync(node_path_1.default.join(current, 'gradle.lockfile')) ||
            node_fs_1.default.existsSync(node_path_1.default.join(current, 'gradle', 'verification-metadata.xml')) ||
            directoryHasFiles(node_path_1.default.join(current, 'gradle', 'dependency-locks'))) {
            return true;
        }
        const parent = node_path_1.default.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return false;
}
function directoryHasFiles(directory) {
    try {
        return node_fs_1.default.existsSync(directory) && node_fs_1.default.readdirSync(directory).length > 0;
    }
    catch {
        return false;
    }
}
function isPathWithinOrEqual(parent, child) {
    const relative = node_path_1.default.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !node_path_1.default.isAbsolute(relative));
}
function lineNumberAt(content, index) {
    return content.slice(0, index).split(/\r?\n/).length;
}
function dedupeJvmEntries(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
        const key = `${entry.line}:${entry.version}:${entry.text}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function checkRuby(context) {
    if (!context.file.endsWith('Gemfile')) {
        return [];
    }
    const findings = [];
    const directory = node_path_1.default.dirname(context.absolutePath);
    if (!node_fs_1.default.existsSync(node_path_1.default.join(directory, 'Gemfile.lock')) &&
        ecosystemBoolean(context.config, 'ruby', 'requireLockfile', true)) {
        findings.push(finding('ruby/lockfile-required', 'ruby', context.file, 1, 'high', 'Gemfile was found without Gemfile.lock.', 'Commit Gemfile.lock so resolved gem versions are deterministic.'));
    }
    for (const gem of parseRubyGemEntries(context.lines)) {
        if (rubyGemHasGitSource(gem.text) && !rubyGemHasPinnedRef(gem.text)) {
            findings.push(finding('ruby/git-ref-sha', 'ruby', context.file, gem.line, 'high', `Ruby git dependency '${gem.text}' does not pin a ref commit SHA.`, 'Add ref: "<40-character commit SHA>" to git dependencies.'));
        }
    }
    return findings;
}
function rubyGemHasGitSource(text) {
    return /(?:\bgit:|:git\s*=>)/.test(text);
}
function rubyGemHasPinnedRef(text) {
    return /(?:\bref:\s*|:ref\s*=>\s*)['"][a-f0-9]{40}['"]/i.test(text);
}
function parseRubyGemEntries(lines) {
    const entries = [];
    let active;
    lines.forEach((line, index) => {
        const stripped = stripRubyComment(line).trim();
        if (!stripped) {
            return;
        }
        if (active) {
            active.text = `${active.text} ${stripped}`.replace(/\s+/g, ' ');
            active.nestingDepth += nestingDelta(stripped);
            if (active.nestingDepth <= 0 && !continuesRubyGemEntry(stripped)) {
                entries.push({
                    text: active.text,
                    line: active.line
                });
                active = undefined;
            }
            return;
        }
        if (!/^gem(?:\s+|\()/.test(stripped)) {
            return;
        }
        const nestingDepth = nestingDelta(stripped);
        if (nestingDepth > 0 || continuesRubyGemEntry(stripped)) {
            active = {
                text: stripped,
                line: index + 1,
                nestingDepth
            };
            return;
        }
        entries.push({
            text: stripped,
            line: index + 1
        });
    });
    if (active) {
        entries.push({
            text: active.text,
            line: active.line
        });
    }
    return entries;
}
function stripRubyComment(line) {
    let quote;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if ((current === '"' || current === "'") && previous !== '\\') {
            quote = quote === current ? undefined : current;
            continue;
        }
        if (!quote && current === '#') {
            return line.slice(0, index);
        }
    }
    return line;
}
function continuesRubyGemEntry(line) {
    return /(?:,|\\)\s*$/.test(line);
}
function nestingDelta(line) {
    let quote;
    let delta = 0;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if ((current === '"' || current === "'") && previous !== '\\') {
            quote = quote === current ? undefined : current;
            continue;
        }
        if (quote) {
            continue;
        }
        if (current === '(' || current === '{' || current === '[') {
            delta += 1;
        }
        else if (current === ')' || current === '}' || current === ']') {
            delta -= 1;
        }
    }
    return delta;
}
function isWorkflowOrActionFile(file) {
    return file.startsWith('.github/workflows/') || /^action\.ya?ml$/i.test(file);
}
function isRustToolchainFile(file) {
    return file.endsWith('rust-toolchain.toml') || isLegacyRustToolchainFile(file);
}
function isLegacyRustToolchainFile(file) {
    return file === 'rust-toolchain' || file.endsWith('/rust-toolchain');
}
function isDockerLikeFile(file) {
    const normalized = file.replaceAll('\\', '/');
    return (isDockerfile(normalized) ||
        /(^|\/)(docker-)?compose.*\.ya?ml$/i.test(normalized) ||
        normalized === '.devcontainer/devcontainer.json');
}
function isDockerfile(file) {
    return /(^|\/)Dockerfile(\.|$)/.test(file.replaceAll('\\', '/'));
}
function isPythonFile(file) {
    return (/requirements.*\.txt$/.test(file) || file.endsWith('pyproject.toml') || file.endsWith('Pipfile'));
}
function parseYamlDocuments(content) {
    try {
        return osl_js_yaml_1.default.loadAll(content);
    }
    catch {
        return [];
    }
}
function collectStringProperties(value, propertyName) {
    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectStringProperties(entry, propertyName));
    }
    if (!isRecord(value)) {
        return [];
    }
    const direct = typeof value[propertyName] === 'string' ? [value[propertyName]] : [];
    const nested = Object.values(value).flatMap((entry) => collectStringProperties(entry, propertyName));
    return [...direct, ...nested];
}
function collectGithubActionsRunnerReferences(document, lines) {
    if (!isRecord(document) || !isRecord(document.jobs)) {
        return [];
    }
    return Object.values(document.jobs).flatMap((job) => {
        if (!isRecord(job)) {
            return [];
        }
        return collectJobRunnerReferences(job, lines);
    });
}
function collectJobRunnerReferences(job, lines) {
    const runsOn = job['runs-on'];
    if (typeof runsOn === 'string') {
        const matrixAxis = matrixAxisFromRunsOn(runsOn);
        if (matrixAxis) {
            return collectMatrixRunnerReferences(job, matrixAxis, lines);
        }
        return [
            {
                label: runsOn,
                line: lineForYamlScalar(lines, 'runs-on', runsOn)
            }
        ];
    }
    if (Array.isArray(runsOn)) {
        return runsOn.flatMap((label) => typeof label === 'string'
            ? [
                {
                    label,
                    line: lineForYamlArrayValue(lines, 'runs-on', label)
                }
            ]
            : []);
    }
    return [];
}
function collectMatrixRunnerReferences(job, axis, lines) {
    if (!isRecord(job.strategy) || !isRecord(job.strategy.matrix)) {
        return [];
    }
    const references = [];
    const axisValues = job.strategy.matrix[axis];
    if (typeof axisValues === 'string') {
        references.push({
            label: axisValues,
            line: lineForYamlValue(lines, axis, axisValues)
        });
    }
    else if (Array.isArray(axisValues)) {
        references.push(...axisValues.flatMap((label) => typeof label === 'string'
            ? [
                {
                    label,
                    line: lineForYamlArrayValue(lines, axis, label)
                }
            ]
            : []));
    }
    const include = job.strategy.matrix.include;
    if (Array.isArray(include)) {
        references.push(...include.flatMap((entry) => {
            if (!isRecord(entry) || typeof entry[axis] !== 'string') {
                return [];
            }
            return [
                {
                    label: entry[axis],
                    line: lineForYamlValue(lines, axis, entry[axis])
                }
            ];
        }));
    }
    return references;
}
function matrixAxisFromRunsOn(runsOn) {
    return runsOn.match(/^\s*\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}\s*$/)?.[1];
}
function isFloatingGithubHostedRunnerLabel(label) {
    return /^(ubuntu|windows|macos)-latest$/.test(label.trim());
}
function parseFallbackRunsOnLabels(value) {
    const withoutComment = value.replace(/\s+#.*$/, '').trim();
    if (!withoutComment || withoutComment.includes('${{')) {
        return [];
    }
    if (withoutComment.startsWith('[') && withoutComment.endsWith(']')) {
        return withoutComment
            .slice(1, -1)
            .split(',')
            .map((entry) => unquoteYamlScalar(entry.trim()))
            .filter(Boolean);
    }
    return [unquoteYamlScalar(withoutComment)].filter(Boolean);
}
function unquoteYamlScalar(value) {
    return value.replace(/^['"]|['"]$/g, '').trim();
}
function terraformBlocks(context) {
    const blocks = [];
    let activeBlock;
    let depth = 0;
    context.lines.forEach((rawLine, index) => {
        const text = stripTerraformComment(rawLine);
        const startMatch = text.match(/^\s*(module|provider|terraform)\b(?:\s+"[^"]+"){0,2}\s*\{/);
        if (!activeBlock && startMatch) {
            activeBlock = {
                type: startMatch[1],
                lines: []
            };
            depth = 0;
        }
        if (!activeBlock) {
            return;
        }
        activeBlock.lines.push({ text, number: index + 1 });
        depth += braceDelta(text);
        if (depth <= 0) {
            blocks.push(activeBlock);
            activeBlock = undefined;
        }
    });
    return blocks;
}
function isTerraformProviderBlock(block) {
    if (block.type === 'provider') {
        return true;
    }
    return (block.type === 'terraform' &&
        block.lines.some((line) => /\brequired_providers\b/.test(line.text)));
}
function stripTerraformComment(line) {
    let quote;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if (current === '"' && previous !== '\\') {
            quote = quote ? undefined : '"';
        }
        if (!quote && current === '#') {
            return line.slice(0, index);
        }
        if (!quote && current === '/' && line[index + 1] === '/') {
            return line.slice(0, index);
        }
    }
    return line;
}
function braceDelta(line) {
    let quote;
    let delta = 0;
    for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const previous = line[index - 1];
        if (current === '"' && previous !== '\\') {
            quote = quote ? undefined : '"';
            continue;
        }
        if (quote) {
            continue;
        }
        if (current === '{') {
            delta += 1;
        }
        else if (current === '}') {
            delta -= 1;
        }
    }
    return delta;
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function safeJson(content) {
    try {
        return JSON.parse(content);
    }
    catch {
        return undefined;
    }
}
function nodeDependencyEntries(json, lines) {
    const entries = [];
    const dependencySectionNames = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
        'bundledDependencies',
        'bundleDependencies'
    ];
    for (const section of dependencySectionNames) {
        const dependencies = json[section];
        if (!isRecord(dependencies)) {
            continue;
        }
        for (const [name, spec] of Object.entries(dependencies)) {
            if (typeof spec === 'string') {
                entries.push({
                    section,
                    name,
                    spec,
                    line: lineForJsonProperty(lines, name, spec)
                });
            }
        }
    }
    entries.push(...collectNodeOverrideEntries(json.overrides, 'overrides', lines));
    entries.push(...collectNodeOverrideEntries(json.resolutions, 'resolutions', lines));
    if (typeof json.packageManager === 'string') {
        entries.push({
            section: 'packageManager',
            name: 'packageManager',
            spec: json.packageManager,
            line: lineForJsonProperty(lines, 'packageManager', json.packageManager)
        });
    }
    return entries;
}
function collectNodeOverrideEntries(value, section, lines, parentName) {
    if (typeof value === 'string' && parentName) {
        return [
            {
                section,
                name: parentName,
                spec: value,
                line: lineForJsonProperty(lines, parentName, value)
            }
        ];
    }
    if (!isRecord(value)) {
        return [];
    }
    return Object.entries(value).flatMap(([name, nested]) => {
        const dependencyName = name === '.' && parentName ? parentName : name;
        if (typeof nested === 'string') {
            return [
                {
                    section,
                    name: dependencyName,
                    spec: nested,
                    line: lineForJsonProperty(lines, name, nested)
                }
            ];
        }
        return collectNodeOverrideEntries(nested, section, lines, dependencyName);
    });
}
function isNodeSpecDeterministic(rawSpec) {
    const spec = rawSpec.trim();
    if (/^(workspace:|file:|link:|portal:|patch:)/.test(spec)) {
        return true;
    }
    if (isNodePackageManagerSpec(spec)) {
        return isExactVersion(spec.slice(spec.lastIndexOf('@') + 1));
    }
    if (isNodeAliasSpec(spec)) {
        const aliasedSpec = spec.slice(spec.lastIndexOf('@') + 1);
        return isExactVersion(aliasedSpec);
    }
    if (isNodeGitSpec(spec)) {
        return hasNodeCommitReference(spec);
    }
    if (/^https?:/.test(spec)) {
        return hasContentAddressedUrlReference(spec);
    }
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[^#]+)?$/.test(spec)) {
        return hasNodeCommitReference(spec);
    }
    return isExactVersion(spec);
}
function hasNodeCommitReference(value) {
    return /#[a-f0-9]{40}$/i.test(value.trim());
}
function isNodeRegistryVersionSpec(spec) {
    const trimmed = spec.trim();
    return (!/^(git\+|git:|github:|https?:|ssh:|file:|workspace:|link:|portal:|patch:)/.test(trimmed) &&
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[^#]+)?$/.test(trimmed));
}
function isNodePackageManagerSpec(spec) {
    return /^(npm|yarn|pnpm)@/.test(spec);
}
function isNodeAliasSpec(spec) {
    return /^npm:[^@]+@/.test(spec) || /^npm:@[^/]+\/[^@]+@/.test(spec);
}
function isNodeGitSpec(spec) {
    return /^(git\+|git:|ssh:|github:)/.test(spec) || isGitReference(spec);
}
function hasContentAddressedUrlReference(spec) {
    return (constants_1.DIGEST_PATTERN.test(spec) ||
        /(?:sha256|sha512)[-=][A-Za-z0-9+/=_-]{32,}/i.test(spec) ||
        /[?#&](?:checksum|integrity|hash)=/.test(spec));
}
function readNodeLockfiles(directory) {
    const lockfiles = [];
    for (const name of ['package-lock.json', 'npm-shrinkwrap.json']) {
        const absolutePath = node_path_1.default.join(directory, name);
        if (node_fs_1.default.existsSync(absolutePath)) {
            lockfiles.push(parseNpmLockfile(absolutePath));
        }
    }
    const yarnLock = node_path_1.default.join(directory, 'yarn.lock');
    if (node_fs_1.default.existsSync(yarnLock)) {
        lockfiles.push(parseYarnLockfile(yarnLock));
    }
    const pnpmLock = node_path_1.default.join(directory, 'pnpm-lock.yaml');
    if (node_fs_1.default.existsSync(pnpmLock)) {
        lockfiles.push(parsePnpmLockfile(pnpmLock));
    }
    return lockfiles;
}
function parseNpmLockfile(absolutePath) {
    const lockfile = {
        type: 'npm',
        path: absolutePath,
        dependencies: new Set(),
        specs: new Set(),
        integrityDependencies: new Set()
    };
    const json = safeJson(node_fs_1.default.readFileSync(absolutePath, 'utf8'));
    if (!json) {
        return lockfile;
    }
    const packages = json.packages;
    if (isRecord(packages)) {
        for (const [packagePath, metadata] of Object.entries(packages)) {
            if (!isRecord(metadata) || packagePath === '') {
                continue;
            }
            const packageName = nodePackageNameFromPath(packagePath);
            if (packageName) {
                lockfile.dependencies.add(packageName);
            }
            if (typeof metadata.integrity === 'string' && packageName) {
                lockfile.integrityDependencies.add(packageName);
            }
            if (typeof metadata.version === 'string' && packageName) {
                lockfile.specs.add(`${packageName}@${metadata.version}`);
            }
        }
    }
    collectNpmDependencyEntries(json.dependencies, lockfile);
    return lockfile;
}
function collectNpmDependencyEntries(value, lockfile) {
    if (!isRecord(value)) {
        return;
    }
    for (const [name, metadata] of Object.entries(value)) {
        lockfile.dependencies.add(name);
        if (isRecord(metadata)) {
            if (typeof metadata.integrity === 'string') {
                lockfile.integrityDependencies.add(name);
            }
            if (typeof metadata.version === 'string') {
                lockfile.specs.add(`${name}@${metadata.version}`);
            }
            collectNpmDependencyEntries(metadata.dependencies, lockfile);
        }
    }
}
function parseYarnLockfile(absolutePath) {
    const content = node_fs_1.default.readFileSync(absolutePath, 'utf8');
    const lockfile = {
        type: 'yarn',
        path: absolutePath,
        dependencies: new Set(),
        specs: new Set(),
        integrityDependencies: new Set()
    };
    let activeDependencies = [];
    for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^"?(@?[^",:\s]+)@([^",:\s]+)"?(?:,.*)?:\s*$/);
        if (match) {
            activeDependencies = [match[1]];
            lockfile.dependencies.add(match[1]);
            lockfile.specs.add(`${match[1]}@${match[2]}`);
            continue;
        }
        if (/^\s+(?:integrity\s+|checksum:)/i.test(line)) {
            activeDependencies.forEach((dependency) => lockfile.integrityDependencies.add(dependency));
        }
    }
    for (const match of content.matchAll(/^"?(@?[^",:\s]+)@([^",:\s]+)"?(?:,.*)?:\s*$/gm)) {
        lockfile.dependencies.add(match[1]);
        lockfile.specs.add(`${match[1]}@${match[2]}`);
    }
    const parsed = parseYamlDocuments(content)[0];
    if (isRecord(parsed)) {
        for (const [key, metadata] of Object.entries(parsed)) {
            const parsedKey = key.match(/^(@?[^@]+)@(.+)$/);
            if (parsedKey) {
                lockfile.dependencies.add(parsedKey[1]);
                lockfile.specs.add(`${parsedKey[1]}@${parsedKey[2]}`);
            }
            if (isRecord(metadata) && (metadata.integrity || metadata.checksum)) {
                if (parsedKey) {
                    lockfile.integrityDependencies.add(parsedKey[1]);
                }
            }
        }
    }
    return lockfile;
}
function parsePnpmLockfile(absolutePath) {
    const lockfile = {
        type: 'pnpm',
        path: absolutePath,
        dependencies: new Set(),
        specs: new Set(),
        integrityDependencies: new Set()
    };
    const parsed = parseYamlDocuments(node_fs_1.default.readFileSync(absolutePath, 'utf8'))[0];
    if (!isRecord(parsed)) {
        return lockfile;
    }
    collectPnpmDependencySpecs(parsed.importers, lockfile);
    collectPnpmPackageEntries(parsed.packages, lockfile);
    return lockfile;
}
function collectPnpmDependencySpecs(value, lockfile) {
    if (!isRecord(value)) {
        return;
    }
    for (const importer of Object.values(value)) {
        if (!isRecord(importer)) {
            continue;
        }
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
            const dependencies = importer[section];
            if (!isRecord(dependencies)) {
                continue;
            }
            for (const [name, metadata] of Object.entries(dependencies)) {
                lockfile.dependencies.add(name);
                if (typeof metadata === 'string') {
                    lockfile.specs.add(`${name}@${metadata}`);
                }
                else if (isRecord(metadata) && typeof metadata.specifier === 'string') {
                    lockfile.specs.add(`${name}@${metadata.specifier}`);
                }
            }
        }
    }
}
function collectPnpmPackageEntries(value, lockfile) {
    if (!isRecord(value)) {
        return;
    }
    for (const [key, metadata] of Object.entries(value)) {
        const parsedKey = key.match(/^\/?(@?[^/]+(?:\/[^/]+)?)(?:@|\/)([^/()]+)(?:\(|$)/);
        if (parsedKey) {
            lockfile.dependencies.add(parsedKey[1]);
            lockfile.specs.add(`${parsedKey[1]}@${parsedKey[2]}`);
        }
        if (parsedKey &&
            isRecord(metadata) &&
            isRecord(metadata.resolution) &&
            metadata.resolution.integrity) {
            lockfile.integrityDependencies.add(parsedKey[1]);
        }
    }
}
function hasNodeLockCoverage(entry, lockfiles) {
    if (entry.section === 'packageManager') {
        return true;
    }
    const packageName = nodeRegistryPackageName(entry.name, entry.spec);
    const exactSpec = nodeExactRegistrySpec(entry.spec);
    return lockfiles.some((lockfile) => {
        const hasPackage = lockfile.dependencies.has(packageName);
        const hasSpec = exactSpec ? lockfile.specs.has(`${packageName}@${exactSpec}`) : true;
        return hasPackage && hasSpec && lockfile.integrityDependencies.has(packageName);
    });
}
function nodeRegistryPackageName(name, spec) {
    const aliasMatch = spec.match(/^npm:(@?[^@]+(?:\/[^@]+)?)@/);
    return aliasMatch ? aliasMatch[1] : name;
}
function nodeExactRegistrySpec(spec) {
    const trimmed = spec.trim();
    if (isExactVersion(trimmed)) {
        return trimmed;
    }
    const aliasMatch = trimmed.match(/^npm:@?[^@]+(?:\/[^@]+)?@(.+)$/);
    return aliasMatch && isExactVersion(aliasMatch[1]) ? aliasMatch[1] : undefined;
}
function nodePackageNameFromPath(packagePath) {
    const normalized = packagePath.replaceAll('\\', '/');
    const marker = 'node_modules/';
    const index = normalized.lastIndexOf(marker);
    if (index === -1) {
        return undefined;
    }
    const parts = normalized.slice(index + marker.length).split('/');
    return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}
function ecosystemBoolean(config, ecosystem, key, fallback) {
    const value = config.ecosystems?.[ecosystem]?.[key];
    return typeof value === 'boolean' ? value : fallback;
}
function lineForText(lines, text) {
    const index = lines.findIndex((line) => line.includes(text));
    return index === -1 ? 1 : index + 1;
}
function lineForJsonProperty(lines, key, value) {
    const escapedKey = escapeRegExp(JSON.stringify(key).slice(1, -1));
    const escapedValue = value ? escapeRegExp(JSON.stringify(value).slice(1, -1)) : undefined;
    const propertyPattern = new RegExp(`"${escapedKey}"\\s*:`);
    const valuePattern = escapedValue ? new RegExp(`:\\s*"${escapedValue}"`) : undefined;
    const index = lines.findIndex((line) => propertyPattern.test(line) && (!valuePattern || valuePattern.test(line)));
    return index === -1 ? lineForText(lines, `"${key}"`) : index + 1;
}
function lineForYamlScalar(lines, key, value) {
    const escaped = escapeRegExp(value);
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*['"]?${escaped}['"]?\\s*(?:#.*)?$`);
    const index = lines.findIndex((line) => pattern.test(line.trim()));
    return index === -1 ? lineForText(lines, value) : index + 1;
}
function lineForYamlValue(lines, key, value) {
    const escapedKey = escapeRegExp(key);
    const escapedValue = escapeRegExp(value);
    const keyAndValuePattern = new RegExp(`\\b${escapedKey}\\b.*${escapedValue}`);
    const keyAndValueIndex = lines.findIndex((line) => keyAndValuePattern.test(line.trim()));
    if (keyAndValueIndex !== -1) {
        return keyAndValueIndex + 1;
    }
    return lineForYamlScalar(lines, key, value);
}
function lineForYamlArrayValue(lines, key, value) {
    const escapedKey = escapeRegExp(key);
    const escapedValue = escapeRegExp(value);
    const inlineArrayPattern = new RegExp(`\\b${escapedKey}\\b.*\\[.*${escapedValue}`);
    const inlineArrayIndex = lines.findIndex((line) => inlineArrayPattern.test(line.trim()));
    if (inlineArrayIndex !== -1) {
        return inlineArrayIndex + 1;
    }
    const listItemPattern = new RegExp(`^\\s*-\\s*['"]?${escapedValue}['"]?(?:\\s+#.*)?$`);
    const keyOnlyPattern = new RegExp(`^\\s*${escapedKey}\\s*:\\s*(?:#.*)?$`);
    for (const [keyIndex, line] of lines.entries()) {
        if (!keyOnlyPattern.test(line)) {
            continue;
        }
        const keyIndent = line.search(/\S/);
        for (let index = keyIndex + 1; index < lines.length; index += 1) {
            const candidate = lines[index];
            if (!candidate.trim() || candidate.trim().startsWith('#')) {
                continue;
            }
            const candidateIndent = candidate.search(/\S/);
            if (candidateIndent <= keyIndent || !/^\s*-/.test(candidate)) {
                break;
            }
            if (listItemPattern.test(candidate)) {
                return index + 1;
            }
        }
    }
    const listItemIndex = lines.findIndex((line) => listItemPattern.test(line));
    if (listItemIndex !== -1) {
        return listItemIndex + 1;
    }
    return lineForYamlValue(lines, key, value);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isGitReference(value) {
    return /\bgit\+|git::|github\.com|gitlab\.com|bitbucket\.org|\.git\b/.test(value);
}
function hasCommitQuery(value) {
    const ref = value.match(/[?&]ref=([^&]+)/)?.[1];
    return Boolean(ref && constants_1.SHA_PATTERN.test(ref));
}
function hasCommitReference(value) {
    return /[@#=][a-f0-9]{40}\b/i.test(value) || /\b[a-f0-9]{40}\b/i.test(value);
}
function isExactVersion(value) {
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}
function applySeverityOverride(finding, config) {
    const override = config.severityOverrides?.[finding.ruleId];
    return override ? { ...finding, severity: override } : finding;
}
function hasRequiredCompanionFile(finding, trackedFiles) {
    if (!finding.ruleId.endsWith('lockfile-required') && finding.ruleId !== 'go/sum-required') {
        return true;
    }
    return trackedFiles.has(finding.file);
}
function isAllowlisted(finding, config) {
    const entries = config.allowlist ?? [];
    return entries.some((entry) => {
        const fileMatches = !entry.file || new osl_minimatch_1.Minimatch(entry.file).match(finding.file);
        const ruleMatches = !entry.ruleId || entry.ruleId === finding.ruleId;
        const ecosystemMatches = !entry.ecosystem || entry.ecosystem === finding.ecosystem;
        const lineMatches = !entry.line || entry.line === finding.line;
        return fileMatches && ruleMatches && ecosystemMatches && lineMatches;
    });
}
function shouldReportFailure(findings, threshold) {
    return findings.some((finding) => constants_1.SEVERITY_ORDER[finding.severity] >= constants_1.SEVERITY_ORDER[threshold]);
}
function defaultExcludeMatchers() {
    return constants_1.DEFAULT_EXCLUDE.map((pattern) => new osl_minimatch_1.Minimatch(pattern, { dot: true }));
}
function rule(id, ecosystem, defaultSeverity, description, evaluate) {
    return {
        id,
        ecosystem,
        defaultSeverity,
        description,
        evaluate
    };
}
function noFileFindings() {
    return [];
}
function finding(ruleId, ecosystem, file, line, severity, message, remediation, suggestion) {
    return {
        ruleId,
        ecosystem,
        file,
        line,
        severity,
        message,
        remediation,
        suggestion
    };
}


/***/ }),

/***/ 4105:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.scan = scan;
exports.discoverFiles = discoverFiles;
exports.resolveScanRoot = resolveScanRoot;
const node_fs_1 = __importDefault(__nccwpck_require__(3024));
const node_path_1 = __importDefault(__nccwpck_require__(6760));
const osl_glob_1 = __nccwpck_require__(6504);
const constants_1 = __nccwpck_require__(7242);
const paths_1 = __nccwpck_require__(8431);
const remote_1 = __nccwpck_require__(6473);
const rules_1 = __nccwpck_require__(5755);
async function scan(options) {
    const files = await discoverFiles(options.root, options.include, options.exclude, options.config);
    const trackedFiles = new Set(files);
    const staticFindings = files.flatMap((file) => (0, rules_1.evaluateFile)(options.root, file, options.config, trackedFiles));
    const remoteResult = options.config.remoteValidation === true
        ? await (0, remote_1.validateRemoteReferences)(options.root, files, options.config)
        : { findings: [], diagnostics: [] };
    const remoteFindings = options.config.remoteValidation === true
        ? (0, rules_1.finalizeFindings)(remoteResult.findings, options.config, trackedFiles)
        : [];
    return {
        findings: [...staticFindings, ...remoteFindings],
        scannedFiles: files,
        diagnostics: remoteResult.diagnostics
    };
}
async function discoverFiles(root, include = constants_1.DEFAULT_INCLUDE, exclude = constants_1.DEFAULT_EXCLUDE, config = {}) {
    const patterns = include.length > 0 ? include : (config.include ?? constants_1.DEFAULT_INCLUDE);
    const ignore = [...constants_1.DEFAULT_EXCLUDE, ...exclude, ...(config.exclude ?? [])];
    const files = await (0, osl_glob_1.glob)(patterns, {
        cwd: root,
        dot: true,
        nodir: true,
        ignore,
        windowsPathsNoEscape: true
    });
    return Array.from(new Set(files
        .map((file) => (0, paths_1.normalizeWorkspaceRelativePath)(root, file))
        .filter((file) => Boolean(file)))).sort();
}
function resolveScanRoot(workspace, requestedPath) {
    const resolvedWorkspace = node_path_1.default.resolve(workspace);
    const resolved = node_path_1.default.resolve(resolvedWorkspace, requestedPath || '.');
    const relative = node_path_1.default.relative(resolvedWorkspace, resolved);
    if (relative === '..' || relative.startsWith(`..${node_path_1.default.sep}`) || node_path_1.default.isAbsolute(relative)) {
        throw new Error(`Scan path must resolve inside GITHUB_WORKSPACE: ${requestedPath || '.'}`);
    }
    if (!(0, paths_1.existingAncestorRealpathStaysInsideRoot)(resolvedWorkspace, resolved)) {
        throw new Error(`Scan path must resolve inside GITHUB_WORKSPACE: ${requestedPath || '.'}`);
    }
    node_fs_1.default.mkdirSync(resolved, { recursive: true });
    return node_fs_1.default.realpathSync(resolved);
}


/***/ }),

/***/ 9896:
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ 7598:
/***/ ((module) => {

module.exports = require("node:crypto");

/***/ }),

/***/ 3053:
/***/ ((module) => {

module.exports = require("node:diagnostics_channel");

/***/ }),

/***/ 8474:
/***/ ((module) => {

module.exports = require("node:events");

/***/ }),

/***/ 3024:
/***/ ((module) => {

module.exports = require("node:fs");

/***/ }),

/***/ 1455:
/***/ ((module) => {

module.exports = require("node:fs/promises");

/***/ }),

/***/ 6760:
/***/ ((module) => {

module.exports = require("node:path");

/***/ }),

/***/ 7075:
/***/ ((module) => {

module.exports = require("node:stream");

/***/ }),

/***/ 6193:
/***/ ((module) => {

module.exports = require("node:string_decoder");

/***/ }),

/***/ 7997:
/***/ ((module) => {

module.exports = require("node:timers");

/***/ }),

/***/ 8500:
/***/ ((module) => {

module.exports = require("node:timers/promises");

/***/ }),

/***/ 3136:
/***/ ((module) => {

module.exports = require("node:url");

/***/ }),

/***/ 2649:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.range = exports.balanced = void 0;
const balanced = (a, b, str) => {
    const ma = a instanceof RegExp ? maybeMatch(a, str) : a;
    const mb = b instanceof RegExp ? maybeMatch(b, str) : b;
    const r = ma !== null && mb != null && (0, exports.range)(ma, mb, str);
    return (r && {
        start: r[0],
        end: r[1],
        pre: str.slice(0, r[0]),
        body: str.slice(r[0] + ma.length, r[1]),
        post: str.slice(r[1] + mb.length),
    });
};
exports.balanced = balanced;
const maybeMatch = (reg, str) => {
    const m = str.match(reg);
    return m ? m[0] : null;
};
const range = (a, b, str) => {
    let begs, beg, left, right = undefined, result;
    let ai = str.indexOf(a);
    let bi = str.indexOf(b, ai + 1);
    let i = ai;
    if (ai >= 0 && bi > 0) {
        if (a === b) {
            return [ai, bi];
        }
        begs = [];
        left = str.length;
        while (i >= 0 && !result) {
            if (i === ai) {
                begs.push(i);
                ai = str.indexOf(a, i + 1);
            }
            else if (begs.length === 1) {
                const r = begs.pop();
                if (r !== undefined)
                    result = [r, bi];
            }
            else {
                beg = begs.pop();
                if (beg !== undefined && beg < left) {
                    left = beg;
                    right = bi;
                }
                bi = str.indexOf(b, i + 1);
            }
            i = ai < bi && ai >= 0 ? ai : bi;
        }
        if (begs.length && right !== undefined) {
            result = [left, right];
        }
    }
    return result;
};
exports.range = range;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 8968:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EXPANSION_MAX = void 0;
exports.expand = expand;
const balanced_match_1 = __nccwpck_require__(2649);
const escSlash = '\0SLASH' + Math.random() + '\0';
const escOpen = '\0OPEN' + Math.random() + '\0';
const escClose = '\0CLOSE' + Math.random() + '\0';
const escComma = '\0COMMA' + Math.random() + '\0';
const escPeriod = '\0PERIOD' + Math.random() + '\0';
const escSlashPattern = new RegExp(escSlash, 'g');
const escOpenPattern = new RegExp(escOpen, 'g');
const escClosePattern = new RegExp(escClose, 'g');
const escCommaPattern = new RegExp(escComma, 'g');
const escPeriodPattern = new RegExp(escPeriod, 'g');
const slashPattern = /\\\\/g;
const openPattern = /\\{/g;
const closePattern = /\\}/g;
const commaPattern = /\\,/g;
const periodPattern = /\\\./g;
exports.EXPANSION_MAX = 100_000;
function numeric(str) {
    return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}
function escapeBraces(str) {
    return str
        .replace(slashPattern, escSlash)
        .replace(openPattern, escOpen)
        .replace(closePattern, escClose)
        .replace(commaPattern, escComma)
        .replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
    return str
        .replace(escSlashPattern, '\\')
        .replace(escOpenPattern, '{')
        .replace(escClosePattern, '}')
        .replace(escCommaPattern, ',')
        .replace(escPeriodPattern, '.');
}
/**
 * Basically just str.split(","), but handling cases
 * where we have nested braced sections, which should be
 * treated as individual members, like {a,{b,c},d}
 */
function parseCommaParts(str) {
    if (!str) {
        return [''];
    }
    const parts = [];
    const m = (0, balanced_match_1.balanced)('{', '}', str);
    if (!m) {
        return str.split(',');
    }
    const { pre, body, post } = m;
    const p = pre.split(',');
    p[p.length - 1] += '{' + body + '}';
    const postParts = parseCommaParts(post);
    if (post.length) {
        ;
        p[p.length - 1] += postParts.shift();
        p.push.apply(p, postParts);
    }
    parts.push.apply(parts, p);
    return parts;
}
function expand(str, options = {}) {
    if (!str) {
        return [];
    }
    const { max = exports.EXPANSION_MAX } = options;
    // I don't know why Bash 4.3 does this, but it does.
    // Anything starting with {} will have the first two bytes preserved
    // but *only* at the top level, so {},a}b will not expand to anything,
    // but a{},b}c will be expanded to [a}c,abc].
    // One could argue that this is a bug in Bash, but since the goal of
    // this module is to match Bash's rules, we escape a leading {}
    if (str.slice(0, 2) === '{}') {
        str = '\\{\\}' + str.slice(2);
    }
    return expand_(escapeBraces(str), max, true).map(unescapeBraces);
}
function embrace(str) {
    return '{' + str + '}';
}
function isPadded(el) {
    return /^-?0\d/.test(el);
}
function lte(i, y) {
    return i <= y;
}
function gte(i, y) {
    return i >= y;
}
function expand_(str, max, isTop) {
    /** @type {string[]} */
    const expansions = [];
    const m = (0, balanced_match_1.balanced)('{', '}', str);
    if (!m)
        return [str];
    // no need to expand pre, since it is guaranteed to be free of brace-sets
    const pre = m.pre;
    const post = m.post.length ? expand_(m.post, max, false) : [''];
    if (/\$$/.test(m.pre)) {
        for (let k = 0; k < post.length && k < max; k++) {
            const expansion = pre + '{' + m.body + '}' + post[k];
            expansions.push(expansion);
        }
    }
    else {
        const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
        const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
        const isSequence = isNumericSequence || isAlphaSequence;
        const isOptions = m.body.indexOf(',') >= 0;
        if (!isSequence && !isOptions) {
            // {a},b}
            if (m.post.match(/,(?!,).*\}/)) {
                str = m.pre + '{' + m.body + escClose + m.post;
                return expand_(str, max, true);
            }
            return [str];
        }
        let n;
        if (isSequence) {
            n = m.body.split(/\.\./);
        }
        else {
            n = parseCommaParts(m.body);
            if (n.length === 1 && n[0] !== undefined) {
                // x{{a,b}}y ==> x{a}y x{b}y
                n = expand_(n[0], max, false).map(embrace);
                //XXX is this necessary? Can't seem to hit it in tests.
                /* c8 ignore start */
                if (n.length === 1) {
                    return post.map(p => m.pre + n[0] + p);
                }
                /* c8 ignore stop */
            }
        }
        // at this point, n is the parts, and we know it's not a comma set
        // with a single entry.
        let N;
        if (isSequence && n[0] !== undefined && n[1] !== undefined) {
            const x = numeric(n[0]);
            const y = numeric(n[1]);
            const width = Math.max(n[0].length, n[1].length);
            let incr = n.length === 3 && n[2] !== undefined ?
                Math.max(Math.abs(numeric(n[2])), 1)
                : 1;
            let test = lte;
            const reverse = y < x;
            if (reverse) {
                incr *= -1;
                test = gte;
            }
            const pad = n.some(isPadded);
            N = [];
            for (let i = x; test(i, y); i += incr) {
                let c;
                if (isAlphaSequence) {
                    c = String.fromCharCode(i);
                    if (c === '\\') {
                        c = '';
                    }
                }
                else {
                    c = String(i);
                    if (pad) {
                        const need = width - c.length;
                        if (need > 0) {
                            const z = new Array(need + 1).join('0');
                            if (i < 0) {
                                c = '-' + z + c.slice(1);
                            }
                            else {
                                c = z + c;
                            }
                        }
                    }
                }
                N.push(c);
            }
        }
        else {
            N = [];
            for (let j = 0; j < n.length; j++) {
                N.push.apply(N, expand_(n[j], max, false));
            }
        }
        for (let j = 0; j < N.length; j++) {
            for (let k = 0; k < post.length && expansions.length < max; k++) {
                const expansion = pre + N[j] + post[k];
                if (!isTop || isSequence || expansion) {
                    expansions.push(expansion);
                }
            }
        }
    }
    return expansions;
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 6504:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

var k=(n,t)=>()=>(t||n((t={exports:{}}).exports,t),t.exports);var ke=k(Y=>{"use strict";Object.defineProperty(Y,"__esModule",{value:!0});Y.range=Y.balanced=void 0;var ks=(n,t,e)=>{let s=n instanceof RegExp?Ce(n,e):n,i=t instanceof RegExp?Ce(t,e):t,r=s!==null&&i!=null&&(0,Y.range)(s,i,e);return r&&{start:r[0],end:r[1],pre:e.slice(0,r[0]),body:e.slice(r[0]+s.length,r[1]),post:e.slice(r[1]+i.length)}};Y.balanced=ks;var Ce=(n,t)=>{let e=t.match(n);return e?e[0]:null},Ms=(n,t,e)=>{let s,i,r,o,h,a=e.indexOf(n),l=e.indexOf(t,a+1),f=a;if(a>=0&&l>0){if(n===t)return[a,l];for(s=[],r=e.length;f>=0&&!h;){if(f===a)s.push(f),a=e.indexOf(n,f+1);else if(s.length===1){let c=s.pop();c!==void 0&&(h=[c,l])}else i=s.pop(),i!==void 0&&i<r&&(r=i,o=l),l=e.indexOf(t,f+1);f=a<l&&a>=0?a:l}s.length&&o!==void 0&&(h=[r,o])}return h};Y.range=Ms});var Ne=k(st=>{"use strict";Object.defineProperty(st,"__esModule",{value:!0});st.EXPANSION_MAX=void 0;st.expand=Is;var Me=ke(),Pe="\0SLASH"+Math.random()+"\0",Fe="\0OPEN"+Math.random()+"\0",le="\0CLOSE"+Math.random()+"\0",De="\0COMMA"+Math.random()+"\0",je="\0PERIOD"+Math.random()+"\0",Ps=new RegExp(Pe,"g"),Fs=new RegExp(Fe,"g"),Ds=new RegExp(le,"g"),js=new RegExp(De,"g"),Ls=new RegExp(je,"g"),Ns=/\\\\/g,Ws=/\\{/g,Bs=/\\}/g,zs=/\\,/g,Gs=/\\\./g;st.EXPANSION_MAX=1e5;function ae(n){return isNaN(n)?n.charCodeAt(0):parseInt(n,10)}function $s(n){return n.replace(Ns,Pe).replace(Ws,Fe).replace(Bs,le).replace(zs,De).replace(Gs,je)}function Us(n){return n.replace(Ps,"\\").replace(Fs,"{").replace(Ds,"}").replace(js,",").replace(Ls,".")}function Le(n){if(!n)return[""];let t=[],e=(0,Me.balanced)("{","}",n);if(!e)return n.split(",");let{pre:s,body:i,post:r}=e,o=s.split(",");o[o.length-1]+="{"+i+"}";let h=Le(r);return r.length&&(o[o.length-1]+=h.shift(),o.push.apply(o,h)),t.push.apply(t,o),t}function Is(n,t={}){if(!n)return[];let{max:e=st.EXPANSION_MAX}=t;return n.slice(0,2)==="{}"&&(n="\\{\\}"+n.slice(2)),ot($s(n),e,!0).map(Us)}function qs(n){return"{"+n+"}"}function Hs(n){return/^-?0\d/.test(n)}function Vs(n,t){return n<=t}function Ks(n,t){return n>=t}function ot(n,t,e){let s=[],i=(0,Me.balanced)("{","}",n);if(!i)return[n];let r=i.pre,o=i.post.length?ot(i.post,t,!1):[""];if(/\$$/.test(i.pre))for(let h=0;h<o.length&&h<t;h++){let a=r+"{"+i.body+"}"+o[h];s.push(a)}else{let h=/^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(i.body),a=/^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(i.body),l=h||a,f=i.body.indexOf(",")>=0;if(!l&&!f)return i.post.match(/,(?!,).*\}/)?(n=i.pre+"{"+i.body+le+i.post,ot(n,t,!0)):[n];let c;if(l)c=i.body.split(/\.\./);else if(c=Le(i.body),c.length===1&&c[0]!==void 0&&(c=ot(c[0],t,!1).map(qs),c.length===1))return o.map(p=>i.pre+c[0]+p);let u;if(l&&c[0]!==void 0&&c[1]!==void 0){let p=ae(c[0]),w=ae(c[1]),d=Math.max(c[0].length,c[1].length),b=c.length===3&&c[2]!==void 0?Math.max(Math.abs(ae(c[2])),1):1,m=Vs;w<p&&(b*=-1,m=Ks);let E=c.some(Hs);u=[];for(let S=p;m(S,w);S+=b){let v;if(a)v=String.fromCharCode(S),v==="\\"&&(v="");else if(v=String(S),E){let V=d-v.length;if(V>0){let I=new Array(V+1).join("0");S<0?v="-"+I+v.slice(1):v=I+v}}u.push(v)}}else{u=[];for(let p=0;p<c.length;p++)u.push.apply(u,ot(c[p],t,!1))}for(let p=0;p<u.length;p++)for(let w=0;w<o.length&&s.length<t;w++){let d=r+u[p]+o[w];(!e||l||d)&&s.push(d)}}return s}});var We=k(xt=>{"use strict";Object.defineProperty(xt,"__esModule",{value:!0});xt.assertValidPattern=void 0;var Xs=1024*64,Ys=n=>{if(typeof n!="string")throw new TypeError("invalid pattern");if(n.length>Xs)throw new TypeError("pattern is too long")};xt.assertValidPattern=Ys});var ze=k(Ot=>{"use strict";Object.defineProperty(Ot,"__esModule",{value:!0});Ot.parseClass=void 0;var Js={"[:alnum:]":["\\p{L}\\p{Nl}\\p{Nd}",!0],"[:alpha:]":["\\p{L}\\p{Nl}",!0],"[:ascii:]":["\\x00-\\x7f",!1],"[:blank:]":["\\p{Zs}\\t",!0],"[:cntrl:]":["\\p{Cc}",!0],"[:digit:]":["\\p{Nd}",!0],"[:graph:]":["\\p{Z}\\p{C}",!0,!0],"[:lower:]":["\\p{Ll}",!0],"[:print:]":["\\p{C}",!0],"[:punct:]":["\\p{P}",!0],"[:space:]":["\\p{Z}\\t\\r\\n\\v\\f",!0],"[:upper:]":["\\p{Lu}",!0],"[:word:]":["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}",!0],"[:xdigit:]":["A-Fa-f0-9",!1]},ht=n=>n.replace(/[[\]\\-]/g,"\\$&"),Zs=n=>n.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&"),Be=n=>n.join(""),Qs=(n,t)=>{let e=t;if(n.charAt(e)!=="[")throw new Error("not in a brace expression");let s=[],i=[],r=e+1,o=!1,h=!1,a=!1,l=!1,f=e,c="";t:for(;r<n.length;){let d=n.charAt(r);if((d==="!"||d==="^")&&r===e+1){l=!0,r++;continue}if(d==="]"&&o&&!a){f=r+1;break}if(o=!0,d==="\\"&&!a){a=!0,r++;continue}if(d==="["&&!a){for(let[b,[m,y,E]]of Object.entries(Js))if(n.startsWith(b,r)){if(c)return["$.",!1,n.length-e,!0];r+=b.length,E?i.push(m):s.push(m),h=h||y;continue t}}if(a=!1,c){d>c?s.push(ht(c)+"-"+ht(d)):d===c&&s.push(ht(d)),c="",r++;continue}if(n.startsWith("-]",r+1)){s.push(ht(d+"-")),r+=2;continue}if(n.startsWith("-",r+1)){c=d,r+=2;continue}s.push(ht(d)),r++}if(f<r)return["",!1,0,!1];if(!s.length&&!i.length)return["$.",!1,n.length-e,!0];if(i.length===0&&s.length===1&&/^\\?.$/.test(s[0])&&!l){let d=s[0].length===2?s[0].slice(-1):s[0];return[Zs(d),!1,f-e,!1]}let u="["+(l?"^":"")+Be(s)+"]",p="["+(l?"":"^")+Be(i)+"]";return[s.length&&i.length?"("+u+"|"+p+")":s.length?u:p,h,f-e,!0]};Ot.parseClass=Qs});var Ct=k(At=>{"use strict";Object.defineProperty(At,"__esModule",{value:!0});At.unescape=void 0;var ti=(n,{windowsPathsNoEscape:t=!1,magicalBraces:e=!0}={})=>e?t?n.replace(/\[([^/\\])\]/g,"$1"):n.replace(/((?!\\).|^)\[([^/\\])\]/g,"$1$2").replace(/\\([^/])/g,"$1"):t?n.replace(/\[([^/\\{}])\]/g,"$1"):n.replace(/((?!\\).|^)\[([^/\\{}])\]/g,"$1$2").replace(/\\([^/{}])/g,"$1");At.unescape=ti});var ue=k(Ft=>{"use strict";var D;Object.defineProperty(Ft,"__esModule",{value:!0});Ft.AST=void 0;var ei=ze(),kt=Ct(),si=new Set(["!","?","+","*","@"]),ce=n=>si.has(n),Ge=n=>ce(n.type),ii=new Map([["!",["@"]],["?",["?","@"]],["@",["@"]],["*",["*","+","?","@"]],["+",["+","@"]]]),ri=new Map([["!",["?"]],["@",["?"]],["+",["?","*"]]]),ni=new Map([["!",["?","@"]],["?",["?","@"]],["@",["?","@"]],["*",["*","+","?","@"]],["+",["+","@","?","*"]]]),$e=new Map([["!",new Map([["!","@"]])],["?",new Map([["*","*"],["+","*"]])],["@",new Map([["!","!"],["?","?"],["@","@"],["*","*"],["+","+"]])],["+",new Map([["?","*"],["*","*"]])]]),oi="(?!(?:^|/)\\.\\.?(?:$|/))",Mt="(?!\\.)",hi=new Set(["[","."]),ai=new Set(["..","."]),li=new Set("().*{}+?[]^$\\!"),ci=n=>n.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&"),fe="[^/]",Ue=fe+"*?",Ie=fe+"+?",fi=0,Pt=class{type;#t;#s;#r=!1;#e=[];#o;#_;#b;#f=!1;#h;#u;#c=!1;id=++fi;get depth(){return(this.#o?.depth??-1)+1}[Symbol.for("nodejs.util.inspect.custom")](){return{"@@type":"AST",id:this.id,type:this.type,root:this.#t.id,parent:this.#o?.id,depth:this.depth,partsLength:this.#e.length,parts:this.#e}}constructor(t,e,s={}){this.type=t,t&&(this.#s=!0),this.#o=e,this.#t=this.#o?this.#o.#t:this,this.#h=this.#t===this?s:this.#t.#h,this.#b=this.#t===this?[]:this.#t.#b,t==="!"&&!this.#t.#f&&this.#b.push(this),this.#_=this.#o?this.#o.#e.length:0}get hasMagic(){if(this.#s!==void 0)return this.#s;for(let t of this.#e)if(typeof t!="string"&&(t.type||t.hasMagic))return this.#s=!0;return this.#s}toString(){return this.#u!==void 0?this.#u:this.type?this.#u=this.type+"("+this.#e.map(t=>String(t)).join("|")+")":this.#u=this.#e.map(t=>String(t)).join("")}#l(){if(this!==this.#t)throw new Error("should only call on root");if(this.#f)return this;this.toString(),this.#f=!0;let t;for(;t=this.#b.pop();){if(t.type!=="!")continue;let e=t,s=e.#o;for(;s;){for(let i=e.#_+1;!s.type&&i<s.#e.length;i++)for(let r of t.#e){if(typeof r=="string")throw new Error("string part in extglob AST??");r.copyIn(s.#e[i])}e=s,s=e.#o}}return this}push(...t){for(let e of t)if(e!==""){if(typeof e!="string"&&!(e instanceof D&&e.#o===this))throw new Error("invalid part: "+e);this.#e.push(e)}}toJSON(){let t=this.type===null?this.#e.slice().map(e=>typeof e=="string"?e:e.toJSON()):[this.type,...this.#e.map(e=>e.toJSON())];return this.isStart()&&!this.type&&t.unshift([]),this.isEnd()&&(this===this.#t||this.#t.#f&&this.#o?.type==="!")&&t.push({}),t}isStart(){if(this.#t===this)return!0;if(!this.#o?.isStart())return!1;if(this.#_===0)return!0;let t=this.#o;for(let e=0;e<this.#_;e++){let s=t.#e[e];if(!(s instanceof D&&s.type==="!"))return!1}return!0}isEnd(){if(this.#t===this||this.#o?.type==="!")return!0;if(!this.#o?.isEnd())return!1;if(!this.type)return this.#o?.isEnd();let t=this.#o?this.#o.#e.length:0;return this.#_===t-1}copyIn(t){typeof t=="string"?this.push(t):this.push(t.clone(this))}clone(t){let e=new D(this.type,t);for(let s of this.#e)e.copyIn(s);return e}static#n(t,e,s,i,r){let o=i.maxExtglobRecursion??2,h=!1,a=!1,l=-1,f=!1;if(e.type===null){let d=s,b="";for(;d<t.length;){let m=t.charAt(d++);if(h||m==="\\"){h=!h,b+=m;continue}if(a){d===l+1?(m==="^"||m==="!")&&(f=!0):m==="]"&&!(d===l+2&&f)&&(a=!1),b+=m;continue}else if(m==="["){a=!0,l=d,f=!1,b+=m;continue}if(!i.noext&&ce(m)&&t.charAt(d)==="("&&r<=o){e.push(b),b="";let E=new D(m,e);d=D.#n(t,E,d,i,r+1),e.push(E);continue}b+=m}return e.push(b),d}let c=s+1,u=new D(null,e),p=[],w="";for(;c<t.length;){let d=t.charAt(c++);if(h||d==="\\"){h=!h,w+=d;continue}if(a){c===l+1?(d==="^"||d==="!")&&(f=!0):d==="]"&&!(c===l+2&&f)&&(a=!1),w+=d;continue}else if(d==="["){a=!0,l=c,f=!1,w+=d;continue}if(!i.noext&&ce(d)&&t.charAt(c)==="("&&(r<=o||e&&e.#p(d))){let m=e&&e.#p(d)?0:1;u.push(w),w="";let y=new D(d,u);u.push(y),c=D.#n(t,y,c,i,r+m);continue}if(d==="|"){u.push(w),w="",p.push(u),u=new D(null,e);continue}if(d===")")return w===""&&e.#e.length===0&&(e.#c=!0),u.push(w),w="",e.push(...p,u),c;w+=d}return e.type=null,e.#s=void 0,e.#e=[t.substring(s-1)],c}#y(t){return this.#v(t,ri)}#v(t,e=ii){if(!t||typeof t!="object"||t.type!==null||t.#e.length!==1||this.type===null)return!1;let s=t.#e[0];return!s||typeof s!="object"||s.type===null?!1:this.#p(s.type,e)}#p(t,e=ni){return!!e.get(this.type)?.includes(t)}#m(t,e){let s=t.#e[0],i=new D(null,s,this.options);i.#e.push(""),s.push(i),this.#x(t,e)}#x(t,e){let s=t.#e[0];this.#e.splice(e,1,...s.#e);for(let i of s.#e)typeof i=="object"&&(i.#o=this);this.#u=void 0}#g(t){return!!$e.get(this.type)?.has(t)}#E(t){if(!t||typeof t!="object"||t.type!==null||t.#e.length!==1||this.type===null||this.#e.length!==1)return!1;let e=t.#e[0];return!e||typeof e!="object"||e.type===null?!1:this.#g(e.type)}#T(t){let e=$e.get(this.type),s=t.#e[0],i=e?.get(s.type);if(!i)return!1;this.#e=s.#e;for(let r of this.#e)typeof r=="object"&&(r.#o=this);this.type=i,this.#u=void 0,this.#c=!1}static fromGlob(t,e={}){let s=new D(null,void 0,e);return D.#n(t,s,0,e,0),s}toMMPattern(){if(this!==this.#t)return this.#t.toMMPattern();let t=this.toString(),[e,s,i,r]=this.toRegExpSource();if(!(i||this.#s||this.#h.nocase&&!this.#h.nocaseMagicOnly&&t.toUpperCase()!==t.toLowerCase()))return s;let h=(this.#h.nocase?"i":"")+(r?"u":"");return Object.assign(new RegExp(`^${e}$`,h),{_src:e,_glob:t})}get options(){return this.#h}toRegExpSource(t){let e=t??!!this.#h.dot;if(this.#t===this&&(this.#d(),this.#l()),!Ge(this)){let a=this.isStart()&&this.isEnd()&&!this.#e.some(p=>typeof p!="string"),l=this.#e.map(p=>{let[w,d,b,m]=typeof p=="string"?D.#S(p,this.#s,a):p.toRegExpSource(t);return this.#s=this.#s||b,this.#r=this.#r||m,w}).join(""),f="";if(this.isStart()&&typeof this.#e[0]=="string"&&!(this.#e.length===1&&ai.has(this.#e[0]))){let w=hi,d=e&&w.has(l.charAt(0))||l.startsWith("\\.")&&w.has(l.charAt(2))||l.startsWith("\\.\\.")&&w.has(l.charAt(4)),b=!e&&!t&&w.has(l.charAt(0));f=d?oi:b?Mt:""}let c="";return this.isEnd()&&this.#t.#f&&this.#o?.type==="!"&&(c="(?:$|\\/)"),[f+l+c,(0,kt.unescape)(l),this.#s=!!this.#s,this.#r]}let s=this.type==="*"||this.type==="+",i=this.type==="!"?"(?:(?!(?:":"(?:",r=this.#w(e);if(this.isStart()&&this.isEnd()&&!r&&this.type!=="!"){let a=this.toString(),l=this;return l.#e=[a],l.type=null,l.#s=void 0,[a,(0,kt.unescape)(this.toString()),!1,!1]}let o=!s||t||e||!Mt?"":this.#w(!0);o===r&&(o=""),o&&(r=`(?:${r})(?:${o})*?`);let h="";if(this.type==="!"&&this.#c)h=(this.isStart()&&!e?Mt:"")+Ie;else{let a=this.type==="!"?"))"+(this.isStart()&&!e&&!t?Mt:"")+Ue+")":this.type==="@"?")":this.type==="?"?")?":this.type==="+"&&o?")":this.type==="*"&&o?")?":`)${this.type}`;h=i+r+a}return[h,(0,kt.unescape)(r),this.#s=!!this.#s,this.#r]}#d(){if(Ge(this)){let t=0,e=!1;do{e=!0;for(let s=0;s<this.#e.length;s++){let i=this.#e[s];typeof i=="object"&&(i.#d(),this.#v(i)?(e=!1,this.#x(i,s)):this.#y(i)?(e=!1,this.#m(i,s)):this.#E(i)&&(e=!1,this.#T(i)))}}while(!e&&++t<10)}else for(let t of this.#e)typeof t=="object"&&t.#d();this.#u=void 0}#w(t){return this.#e.map(e=>{if(typeof e=="string")throw new Error("string type in extglob ast??");let[s,i,r,o]=e.toRegExpSource(t);return this.#r=this.#r||o,s}).filter(e=>!(this.isStart()&&this.isEnd())||!!e).join("|")}static#S(t,e,s=!1){let i=!1,r="",o=!1,h=!1;for(let a=0;a<t.length;a++){let l=t.charAt(a);if(i){i=!1,r+=(li.has(l)?"\\":"")+l;continue}if(l==="*"){if(h)continue;h=!0,r+=s&&/^[*]+$/.test(t)?Ie:Ue,e=!0;continue}else h=!1;if(l==="\\"){a===t.length-1?r+="\\\\":i=!0;continue}if(l==="["){let[f,c,u,p]=(0,ei.parseClass)(t,a);if(u){r+=f,o=o||c,a+=u-1,e=e||p;continue}}if(l==="?"){r+=fe,e=!0;continue}r+=ci(l)}return[r,(0,kt.unescape)(t),!!e,o]}};Ft.AST=Pt;D=Pt});var de=k(Dt=>{"use strict";Object.defineProperty(Dt,"__esModule",{value:!0});Dt.escape=void 0;var ui=(n,{windowsPathsNoEscape:t=!1,magicalBraces:e=!1}={})=>e?t?n.replace(/[?*()[\]{}]/g,"[$&]"):n.replace(/[?*()[\]\\{}]/g,"\\$&"):t?n.replace(/[?*()[\]]/g,"[$&]"):n.replace(/[?*()[\]\\]/g,"\\$&");Dt.escape=ui});var at=k(g=>{"use strict";Object.defineProperty(g,"__esModule",{value:!0});g.unescape=g.escape=g.AST=g.Minimatch=g.match=g.makeRe=g.braceExpand=g.defaults=g.filter=g.GLOBSTAR=g.sep=g.minimatch=void 0;var di=Ne(),jt=We(),Ve=ue(),pi=de(),mi=Ct(),gi=(n,t,e={})=>((0,jt.assertValidPattern)(t),!e.nocomment&&t.charAt(0)==="#"?!1:new J(t,e).match(n));g.minimatch=gi;var wi=/^\*+([^+@!?*[(]*)$/,bi=n=>t=>!t.startsWith(".")&&t.endsWith(n),yi=n=>t=>t.endsWith(n),Si=n=>(n=n.toLowerCase(),t=>!t.startsWith(".")&&t.toLowerCase().endsWith(n)),vi=n=>(n=n.toLowerCase(),t=>t.toLowerCase().endsWith(n)),Ei=/^\*+\.\*+$/,_i=n=>!n.startsWith(".")&&n.includes("."),Ti=n=>n!=="."&&n!==".."&&n.includes("."),Ri=/^\.\*+$/,xi=n=>n!=="."&&n!==".."&&n.startsWith("."),Oi=/^\*+$/,Ai=n=>n.length!==0&&!n.startsWith("."),Ci=n=>n.length!==0&&n!=="."&&n!=="..",ki=/^\?+([^+@!?*[(]*)?$/,Mi=([n,t=""])=>{let e=Ke([n]);return t?(t=t.toLowerCase(),s=>e(s)&&s.toLowerCase().endsWith(t)):e},Pi=([n,t=""])=>{let e=Xe([n]);return t?(t=t.toLowerCase(),s=>e(s)&&s.toLowerCase().endsWith(t)):e},Fi=([n,t=""])=>{let e=Xe([n]);return t?s=>e(s)&&s.endsWith(t):e},Di=([n,t=""])=>{let e=Ke([n]);return t?s=>e(s)&&s.endsWith(t):e},Ke=([n])=>{let t=n.length;return e=>e.length===t&&!e.startsWith(".")},Xe=([n])=>{let t=n.length;return e=>e.length===t&&e!=="."&&e!==".."},Ye=typeof process=="object"&&process?typeof process.env=="object"&&process.env&&process.env.__MINIMATCH_TESTING_PLATFORM__||process.platform:"posix",qe={win32:{sep:"\\"},posix:{sep:"/"}};g.sep=Ye==="win32"?qe.win32.sep:qe.posix.sep;g.minimatch.sep=g.sep;g.GLOBSTAR=Symbol("globstar **");g.minimatch.GLOBSTAR=g.GLOBSTAR;var ji="[^/]",Li=ji+"*?",Ni="(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?",Wi="(?:(?!(?:\\/|^)\\.).)*?",Bi=(n,t={})=>e=>(0,g.minimatch)(e,n,t);g.filter=Bi;g.minimatch.filter=g.filter;var L=(n,t={})=>Object.assign({},n,t),zi=n=>{if(!n||typeof n!="object"||!Object.keys(n).length)return g.minimatch;let t=g.minimatch;return Object.assign((s,i,r={})=>t(s,i,L(n,r)),{Minimatch:class extends t.Minimatch{constructor(i,r={}){super(i,L(n,r))}static defaults(i){return t.defaults(L(n,i)).Minimatch}},AST:class extends t.AST{constructor(i,r,o={}){super(i,r,L(n,o))}static fromGlob(i,r={}){return t.AST.fromGlob(i,L(n,r))}},unescape:(s,i={})=>t.unescape(s,L(n,i)),escape:(s,i={})=>t.escape(s,L(n,i)),filter:(s,i={})=>t.filter(s,L(n,i)),defaults:s=>t.defaults(L(n,s)),makeRe:(s,i={})=>t.makeRe(s,L(n,i)),braceExpand:(s,i={})=>t.braceExpand(s,L(n,i)),match:(s,i,r={})=>t.match(s,i,L(n,r)),sep:t.sep,GLOBSTAR:g.GLOBSTAR})};g.defaults=zi;g.minimatch.defaults=g.defaults;var Gi=(n,t={})=>((0,jt.assertValidPattern)(n),t.nobrace||!/\{(?:(?!\{).)*\}/.test(n)?[n]:(0,di.expand)(n,{max:t.braceExpandMax}));g.braceExpand=Gi;g.minimatch.braceExpand=g.braceExpand;var $i=(n,t={})=>new J(n,t).makeRe();g.makeRe=$i;g.minimatch.makeRe=g.makeRe;var Ui=(n,t,e={})=>{let s=new J(t,e);return n=n.filter(i=>s.match(i)),s.options.nonull&&!n.length&&n.push(t),n};g.match=Ui;g.minimatch.match=g.match;var He=/[?*]|[+@!]\(.*?\)|\[|\]/,Ii=n=>n.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&"),J=class{options;set;pattern;windowsPathsNoEscape;nonegate;negate;comment;empty;preserveMultipleSlashes;partial;globSet;globParts;nocase;isWindows;platform;windowsNoMagicRoot;maxGlobstarRecursion;regexp;constructor(t,e={}){(0,jt.assertValidPattern)(t),e=e||{},this.options=e,this.maxGlobstarRecursion=e.maxGlobstarRecursion??200,this.pattern=t,this.platform=e.platform||Ye,this.isWindows=this.platform==="win32";let s="allowWindowsEscape";this.windowsPathsNoEscape=!!e.windowsPathsNoEscape||e[s]===!1,this.windowsPathsNoEscape&&(this.pattern=this.pattern.replace(/\\/g,"/")),this.preserveMultipleSlashes=!!e.preserveMultipleSlashes,this.regexp=null,this.negate=!1,this.nonegate=!!e.nonegate,this.comment=!1,this.empty=!1,this.partial=!!e.partial,this.nocase=!!this.options.nocase,this.windowsNoMagicRoot=e.windowsNoMagicRoot!==void 0?e.windowsNoMagicRoot:!!(this.isWindows&&this.nocase),this.globSet=[],this.globParts=[],this.set=[],this.make()}hasMagic(){if(this.options.magicalBraces&&this.set.length>1)return!0;for(let t of this.set)for(let e of t)if(typeof e!="string")return!0;return!1}debug(...t){}make(){let t=this.pattern,e=this.options;if(!e.nocomment&&t.charAt(0)==="#"){this.comment=!0;return}if(!t){this.empty=!0;return}this.parseNegate(),this.globSet=[...new Set(this.braceExpand())],e.debug&&(this.debug=(...r)=>console.error(...r)),this.debug(this.pattern,this.globSet);let s=this.globSet.map(r=>this.slashSplit(r));this.globParts=this.preprocess(s),this.debug(this.pattern,this.globParts);let i=this.globParts.map((r,o,h)=>{if(this.isWindows&&this.windowsNoMagicRoot){let a=r[0]===""&&r[1]===""&&(r[2]==="?"||!He.test(r[2]))&&!He.test(r[3]),l=/^[a-z]:/i.test(r[0]);if(a)return[...r.slice(0,4),...r.slice(4).map(f=>this.parse(f))];if(l)return[r[0],...r.slice(1).map(f=>this.parse(f))]}return r.map(a=>this.parse(a))});if(this.debug(this.pattern,i),this.set=i.filter(r=>r.indexOf(!1)===-1),this.isWindows)for(let r=0;r<this.set.length;r++){let o=this.set[r];o[0]===""&&o[1]===""&&this.globParts[r][2]==="?"&&typeof o[3]=="string"&&/^[a-z]:$/i.test(o[3])&&(o[2]="?")}this.debug(this.pattern,this.set)}preprocess(t){if(this.options.noglobstar)for(let s of t)for(let i=0;i<s.length;i++)s[i]==="**"&&(s[i]="*");let{optimizationLevel:e=1}=this.options;return e>=2?(t=this.firstPhasePreProcess(t),t=this.secondPhasePreProcess(t)):e>=1?t=this.levelOneOptimize(t):t=this.adjascentGlobstarOptimize(t),t}adjascentGlobstarOptimize(t){return t.map(e=>{let s=-1;for(;(s=e.indexOf("**",s+1))!==-1;){let i=s;for(;e[i+1]==="**";)i++;i!==s&&e.splice(s,i-s)}return e})}levelOneOptimize(t){return t.map(e=>(e=e.reduce((s,i)=>{let r=s[s.length-1];return i==="**"&&r==="**"?s:i===".."&&r&&r!==".."&&r!=="."&&r!=="**"?(s.pop(),s):(s.push(i),s)},[]),e.length===0?[""]:e))}levelTwoFileOptimize(t){Array.isArray(t)||(t=this.slashSplit(t));let e=!1;do{if(e=!1,!this.preserveMultipleSlashes){for(let i=1;i<t.length-1;i++){let r=t[i];i===1&&r===""&&t[0]===""||(r==="."||r==="")&&(e=!0,t.splice(i,1),i--)}t[0]==="."&&t.length===2&&(t[1]==="."||t[1]==="")&&(e=!0,t.pop())}let s=0;for(;(s=t.indexOf("..",s+1))!==-1;){let i=t[s-1];i&&i!=="."&&i!==".."&&i!=="**"&&!(this.isWindows&&/^[a-z]:$/i.test(i))&&(e=!0,t.splice(s-1,2),s-=2)}}while(e);return t.length===0?[""]:t}firstPhasePreProcess(t){let e=!1;do{e=!1;for(let s of t){let i=-1;for(;(i=s.indexOf("**",i+1))!==-1;){let o=i;for(;s[o+1]==="**";)o++;o>i&&s.splice(i+1,o-i);let h=s[i+1],a=s[i+2],l=s[i+3];if(h!==".."||!a||a==="."||a===".."||!l||l==="."||l==="..")continue;e=!0,s.splice(i,1);let f=s.slice(0);f[i]="**",t.push(f),i--}if(!this.preserveMultipleSlashes){for(let o=1;o<s.length-1;o++){let h=s[o];o===1&&h===""&&s[0]===""||(h==="."||h==="")&&(e=!0,s.splice(o,1),o--)}s[0]==="."&&s.length===2&&(s[1]==="."||s[1]==="")&&(e=!0,s.pop())}let r=0;for(;(r=s.indexOf("..",r+1))!==-1;){let o=s[r-1];if(o&&o!=="."&&o!==".."&&o!=="**"){e=!0;let a=r===1&&s[r+1]==="**"?["."]:[];s.splice(r-1,2,...a),s.length===0&&s.push(""),r-=2}}}}while(e);return t}secondPhasePreProcess(t){for(let e=0;e<t.length-1;e++)for(let s=e+1;s<t.length;s++){let i=this.partsMatch(t[e],t[s],!this.preserveMultipleSlashes);if(i){t[e]=[],t[s]=i;break}}return t.filter(e=>e.length)}partsMatch(t,e,s=!1){let i=0,r=0,o=[],h="";for(;i<t.length&&r<e.length;)if(t[i]===e[r])o.push(h==="b"?e[r]:t[i]),i++,r++;else if(s&&t[i]==="**"&&e[r]===t[i+1])o.push(t[i]),i++;else if(s&&e[r]==="**"&&t[i]===e[r+1])o.push(e[r]),r++;else if(t[i]==="*"&&e[r]&&(this.options.dot||!e[r].startsWith("."))&&e[r]!=="**"){if(h==="b")return!1;h="a",o.push(t[i]),i++,r++}else if(e[r]==="*"&&t[i]&&(this.options.dot||!t[i].startsWith("."))&&t[i]!=="**"){if(h==="a")return!1;h="b",o.push(e[r]),i++,r++}else return!1;return t.length===e.length&&o}parseNegate(){if(this.nonegate)return;let t=this.pattern,e=!1,s=0;for(let i=0;i<t.length&&t.charAt(i)==="!";i++)e=!e,s++;s&&(this.pattern=t.slice(s)),this.negate=e}matchOne(t,e,s=!1){let i=0,r=0;if(this.isWindows){let h=typeof t[0]=="string"&&/^[a-z]:$/i.test(t[0]),a=!h&&t[0]===""&&t[1]===""&&t[2]==="?"&&/^[a-z]:$/i.test(t[3]),l=typeof e[0]=="string"&&/^[a-z]:$/i.test(e[0]),f=!l&&e[0]===""&&e[1]===""&&e[2]==="?"&&typeof e[3]=="string"&&/^[a-z]:$/i.test(e[3]),c=a?3:h?0:void 0,u=f?3:l?0:void 0;if(typeof c=="number"&&typeof u=="number"){let[p,w]=[t[c],e[u]];p.toLowerCase()===w.toLowerCase()&&(e[u]=p,r=u,i=c)}}let{optimizationLevel:o=1}=this.options;return o>=2&&(t=this.levelTwoFileOptimize(t)),e.includes(g.GLOBSTAR)?this.#t(t,e,s,i,r):this.#r(t,e,s,i,r)}#t(t,e,s,i,r){let o=e.indexOf(g.GLOBSTAR,r),h=e.lastIndexOf(g.GLOBSTAR),[a,l,f]=s?[e.slice(r,o),e.slice(o+1),[]]:[e.slice(r,o),e.slice(o+1,h),e.slice(h+1)];if(a.length){let y=t.slice(i,i+a.length);if(!this.#r(y,a,s,0,0))return!1;i+=a.length,r+=a.length}let c=0;if(f.length){if(f.length+i>t.length)return!1;let y=t.length-f.length;if(this.#r(t,f,s,y,0))c=f.length;else{if(t[t.length-1]!==""||i+f.length===t.length||(y--,!this.#r(t,f,s,y,0)))return!1;c=f.length+1}}if(!l.length){let y=!!c;for(let E=i;E<t.length-c;E++){let S=String(t[E]);if(y=!0,S==="."||S===".."||!this.options.dot&&S.startsWith("."))return!1}return s||y}let u=[[[],0]],p=u[0],w=0,d=[0];for(let y of l)y===g.GLOBSTAR?(d.push(w),p=[[],0],u.push(p)):(p[0].push(y),w++);let b=u.length-1,m=t.length-c;for(let y of u)y[1]=m-(d[b--]+y[0].length);return!!this.#s(t,u,i,0,s,0,!!c)}#s(t,e,s,i,r,o,h){let a=e[i];if(!a){for(let c=s;c<t.length;c++){h=!0;let u=t[c];if(u==="."||u===".."||!this.options.dot&&u.startsWith("."))return!1}return h}let[l,f]=a;for(;s<=f;){if(this.#r(t.slice(0,s+l.length),l,r,s,0)&&o<this.maxGlobstarRecursion){let p=this.#s(t,e,s+l.length,i+1,r,o+1,h);if(p!==!1)return p}let u=t[s];if(u==="."||u===".."||!this.options.dot&&u.startsWith("."))return!1;s++}return r||null}#r(t,e,s,i,r){let o,h,a,l;for(o=i,h=r,l=t.length,a=e.length;o<l&&h<a;o++,h++){this.debug("matchOne loop");let f=e[h],c=t[o];if(this.debug(e,f,c),f===!1||f===g.GLOBSTAR)return!1;let u;if(typeof f=="string"?(u=c===f,this.debug("string match",f,c,u)):(u=f.test(c),this.debug("pattern match",f,c,u)),!u)return!1}if(o===l&&h===a)return!0;if(o===l)return s;if(h===a)return o===l-1&&t[o]==="";throw new Error("wtf?")}braceExpand(){return(0,g.braceExpand)(this.pattern,this.options)}parse(t){(0,jt.assertValidPattern)(t);let e=this.options;if(t==="**")return g.GLOBSTAR;if(t==="")return"";let s,i=null;(s=t.match(Oi))?i=e.dot?Ci:Ai:(s=t.match(wi))?i=(e.nocase?e.dot?vi:Si:e.dot?yi:bi)(s[1]):(s=t.match(ki))?i=(e.nocase?e.dot?Pi:Mi:e.dot?Fi:Di)(s):(s=t.match(Ei))?i=e.dot?Ti:_i:(s=t.match(Ri))&&(i=xi);let r=Ve.AST.fromGlob(t,this.options).toMMPattern();return i&&typeof r=="object"&&Reflect.defineProperty(r,"test",{value:i}),r}makeRe(){if(this.regexp||this.regexp===!1)return this.regexp;let t=this.set;if(!t.length)return this.regexp=!1,this.regexp;let e=this.options,s=e.noglobstar?Li:e.dot?Ni:Wi,i=new Set(e.nocase?["i"]:[]),r=t.map(a=>{let l=a.map(c=>{if(c instanceof RegExp)for(let u of c.flags.split(""))i.add(u);return typeof c=="string"?Ii(c):c===g.GLOBSTAR?g.GLOBSTAR:c._src});l.forEach((c,u)=>{let p=l[u+1],w=l[u-1];c!==g.GLOBSTAR||w===g.GLOBSTAR||(w===void 0?p!==void 0&&p!==g.GLOBSTAR?l[u+1]="(?:\\/|"+s+"\\/)?"+p:l[u]=s:p===void 0?l[u-1]=w+"(?:\\/|\\/"+s+")?":p!==g.GLOBSTAR&&(l[u-1]=w+"(?:\\/|\\/"+s+"\\/)"+p,l[u+1]=g.GLOBSTAR))});let f=l.filter(c=>c!==g.GLOBSTAR);if(this.partial&&f.length>=1){let c=[];for(let u=1;u<=f.length;u++)c.push(f.slice(0,u).join("/"));return"(?:"+c.join("|")+")"}return f.join("/")}).join("|"),[o,h]=t.length>1?["(?:",")"]:["",""];r="^"+o+r+h+"$",this.partial&&(r="^(?:\\/|"+o+r.slice(1,-1)+h+")$"),this.negate&&(r="^(?!"+r+").+$");try{this.regexp=new RegExp(r,[...i].join(""))}catch{this.regexp=!1}return this.regexp}slashSplit(t){return this.preserveMultipleSlashes?t.split("/"):this.isWindows&&/^\/\/[^/]+/.test(t)?["",...t.split(/\/+/)]:t.split(/\/+/)}match(t,e=this.partial){if(this.debug("match",t,this.pattern),this.comment)return!1;if(this.empty)return t==="";if(t==="/"&&e)return!0;let s=this.options;this.isWindows&&(t=t.split("\\").join("/"));let i=this.slashSplit(t);this.debug(this.pattern,"split",i);let r=this.set;this.debug(this.pattern,"set",r);let o=i[i.length-1];if(!o)for(let h=i.length-2;!o&&h>=0;h--)o=i[h];for(let h of r){let a=i;if(s.matchBase&&h.length===1&&(a=[o]),this.matchOne(a,h,e))return s.flipNegate?!0:!this.negate}return s.flipNegate?!1:this.negate}static defaults(t){return g.minimatch.defaults(t).Minimatch}};g.Minimatch=J;var qi=ue();Object.defineProperty(g,"AST",{enumerable:!0,get:function(){return qi.AST}});var Hi=de();Object.defineProperty(g,"escape",{enumerable:!0,get:function(){return Hi.escape}});var Vi=Ct();Object.defineProperty(g,"unescape",{enumerable:!0,get:function(){return Vi.unescape}});g.minimatch.AST=Ve.AST;g.minimatch.Minimatch=J;g.minimatch.escape=pi.escape;g.minimatch.unescape=mi.unescape});var es=k(Nt=>{"use strict";var Ki=(n,t)=>()=>(t||n((t={exports:{}}).exports,t),t.exports),Xi=Ki(n=>{"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.tracing=n.metrics=void 0;var t=__nccwpck_require__(3053);n.metrics=(0,t.channel)("lru-cache:metrics"),n.tracing=(0,t.tracingChannel)("lru-cache")});Object.defineProperty(Nt,"__esModule",{value:!0});Nt.LRUCache=void 0;var T=Xi(),lt=()=>T.metrics.hasSubscribers||T.tracing.hasSubscribers,Yi=typeof performance=="object"&&performance&&typeof performance.now=="function"?performance:Date,Ze=new Set,Je=typeof process=="object"&&process?process:{},Ji=(n,t,e,s)=>{typeof Je.emitWarning=="function"?Je.emitWarning(n,t,e,s):console.error(`[${e}] ${t}: ${n}`)},Zi=n=>!Ze.has(n),K=n=>!!n&&n===Math.floor(n)&&n>0&&isFinite(n),Qe=n=>K(n)?n<=Math.pow(2,8)?Uint8Array:n<=Math.pow(2,16)?Uint16Array:n<=Math.pow(2,32)?Uint32Array:n<=Number.MAX_SAFE_INTEGER?Lt:null:null,Lt=class extends Array{constructor(n){super(n),this.fill(0)}},Qi=class ct{heap;length;static#t=!1;static create(t){let e=Qe(t);if(!e)return[];ct.#t=!0;let s=new ct(t,e);return ct.#t=!1,s}constructor(t,e){if(!ct.#t)throw new TypeError("instantiate Stack using Stack.create(n)");this.heap=new e(t),this.length=0}push(t){this.heap[this.length++]=t}pop(){return this.heap[--this.length]}},tr=class ts{#t;#s;#r;#e;#o;#_;#b;#f;get perf(){return this.#f}ttl;ttlResolution;ttlAutopurge;updateAgeOnGet;updateAgeOnHas;allowStale;noDisposeOnSet;noUpdateTTL;maxEntrySize;sizeCalculation;noDeleteOnFetchRejection;noDeleteOnStaleGet;allowStaleOnFetchAbort;allowStaleOnFetchRejection;ignoreFetchAbort;#h;#u;#c;#l;#n;#y;#v;#p;#m;#x;#g;#E;#T;#d;#w;#S;#O;#i;#F;static unsafeExposeInternals(t){return{starts:t.#T,ttls:t.#d,autopurgeTimers:t.#w,sizes:t.#E,keyMap:t.#c,keyList:t.#l,valList:t.#n,next:t.#y,prev:t.#v,get head(){return t.#p},get tail(){return t.#m},free:t.#x,isBackgroundFetch:e=>t.#a(e),backgroundFetch:(e,s,i,r)=>t.#N(e,s,i,r),moveToTail:e=>t.#K(e),indexes:e=>t.#C(e),rindexes:e=>t.#k(e),isStale:e=>t.#R(e)}}get max(){return this.#t}get maxSize(){return this.#s}get calculatedSize(){return this.#u}get size(){return this.#h}get fetchMethod(){return this.#_}get memoMethod(){return this.#b}get dispose(){return this.#r}get onInsert(){return this.#e}get disposeAfter(){return this.#o}constructor(t){let{max:e=0,ttl:s,ttlResolution:i=1,ttlAutopurge:r,updateAgeOnGet:o,updateAgeOnHas:h,allowStale:a,dispose:l,onInsert:f,disposeAfter:c,noDisposeOnSet:u,noUpdateTTL:p,maxSize:w=0,maxEntrySize:d=0,sizeCalculation:b,fetchMethod:m,memoMethod:y,noDeleteOnFetchRejection:E,noDeleteOnStaleGet:S,allowStaleOnFetchRejection:v,allowStaleOnFetchAbort:V,ignoreFetchAbort:I,perf:tt}=t;if(tt!==void 0&&typeof tt?.now!="function")throw new TypeError("perf option must have a now() method if specified");if(this.#f=tt??Yi,e!==0&&!K(e))throw new TypeError("max option must be a nonnegative integer");let et=e?Qe(e):Array;if(!et)throw new Error("invalid max value: "+e);if(this.#t=e,this.#s=w,this.maxEntrySize=d||this.#s,this.sizeCalculation=b,this.sizeCalculation){if(!this.#s&&!this.maxEntrySize)throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");if(typeof this.sizeCalculation!="function")throw new TypeError("sizeCalculation set to non-function")}if(y!==void 0&&typeof y!="function")throw new TypeError("memoMethod must be a function if defined");if(this.#b=y,m!==void 0&&typeof m!="function")throw new TypeError("fetchMethod must be a function if specified");if(this.#_=m,this.#O=!!m,this.#c=new Map,this.#l=Array.from({length:e}).fill(void 0),this.#n=Array.from({length:e}).fill(void 0),this.#y=new et(e),this.#v=new et(e),this.#p=0,this.#m=0,this.#x=Qi.create(e),this.#h=0,this.#u=0,typeof l=="function"&&(this.#r=l),typeof f=="function"&&(this.#e=f),typeof c=="function"?(this.#o=c,this.#g=[]):(this.#o=void 0,this.#g=void 0),this.#S=!!this.#r,this.#F=!!this.#e,this.#i=!!this.#o,this.noDisposeOnSet=!!u,this.noUpdateTTL=!!p,this.noDeleteOnFetchRejection=!!E,this.allowStaleOnFetchRejection=!!v,this.allowStaleOnFetchAbort=!!V,this.ignoreFetchAbort=!!I,this.maxEntrySize!==0){if(this.#s!==0&&!K(this.#s))throw new TypeError("maxSize must be a positive integer if specified");if(!K(this.maxEntrySize))throw new TypeError("maxEntrySize must be a positive integer if specified");this.#I()}if(this.allowStale=!!a,this.noDeleteOnStaleGet=!!S,this.updateAgeOnGet=!!o,this.updateAgeOnHas=!!h,this.ttlResolution=K(i)||i===0?i:1,this.ttlAutopurge=!!r,this.ttl=s||0,this.ttl){if(!K(this.ttl))throw new TypeError("ttl must be a positive integer if specified");this.#M()}if(this.#t===0&&this.ttl===0&&this.#s===0)throw new TypeError("At least one of max, maxSize, or ttl is required");if(!this.ttlAutopurge&&!this.#t&&!this.#s){let he="LRU_CACHE_UNBOUNDED";Zi(he)&&(Ze.add(he),Ji("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.","UnboundedCacheWarning",he,ts))}}getRemainingTTL(t){return this.#c.has(t)?1/0:0}#M(){let t=new Lt(this.#t),e=new Lt(this.#t);this.#d=t,this.#T=e;let s=this.ttlAutopurge?Array.from({length:this.#t}):void 0;this.#w=s,this.#B=(h,a,l=this.#f.now())=>{e[h]=a!==0?l:0,t[h]=a,i(h,a)},this.#A=h=>{e[h]=t[h]!==0?this.#f.now():0,i(h,t[h])};let i=this.ttlAutopurge?(h,a)=>{if(s?.[h]&&(clearTimeout(s[h]),s[h]=void 0),a&&a!==0&&s){let l=setTimeout(()=>{this.#R(h)&&this.#W(this.#l[h],"expire")},a+1);l.unref&&l.unref(),s[h]=l}}:()=>{};this.#P=(h,a)=>{if(t[a]){let l=t[a],f=e[a];if(!l||!f)return;h.ttl=l,h.start=f,h.now=r||o();let c=h.now-f;h.remainingTTL=l-c}};let r=0,o=()=>{let h=this.#f.now();if(this.ttlResolution>0){r=h;let a=setTimeout(()=>r=0,this.ttlResolution);a.unref&&a.unref()}return h};this.getRemainingTTL=h=>{let a=this.#c.get(h);if(a===void 0)return 0;let l=t[a],f=e[a];if(!l||!f)return 1/0;let c=(r||o())-f;return l-c},this.#R=h=>{let a=e[h],l=t[h];return!!l&&!!a&&(r||o())-a>l}}#A=()=>{};#P=()=>{};#B=()=>{};#R=()=>!1;#I(){let t=new Lt(this.#t);this.#u=0,this.#E=t,this.#j=e=>{this.#u-=t[e],t[e]=0},this.#z=(e,s,i,r)=>{if(this.#a(s))return 0;if(!K(i))if(r){if(typeof r!="function")throw new TypeError("sizeCalculation must be a function");if(i=r(s,e),!K(i))throw new TypeError("sizeCalculation return invalid (expect positive integer)")}else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");return i},this.#D=(e,s,i)=>{if(t[e]=s,this.#s){let r=this.#s-t[e];for(;this.#u>r;)this.#U(!0)}this.#u+=t[e],i&&(i.entrySize=s,i.totalCalculatedSize=this.#u)}}#j=t=>{};#D=(t,e,s)=>{};#z=(t,e,s,i)=>{if(s||i)throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");return 0};*#C({allowStale:t=this.allowStale}={}){if(this.#h)for(let e=this.#m;this.#G(e)&&((t||!this.#R(e))&&(yield e),e!==this.#p);)e=this.#v[e]}*#k({allowStale:t=this.allowStale}={}){if(this.#h)for(let e=this.#p;this.#G(e)&&((t||!this.#R(e))&&(yield e),e!==this.#m);)e=this.#y[e]}#G(t){return t!==void 0&&this.#c.get(this.#l[t])===t}*entries(){for(let t of this.#C())this.#n[t]!==void 0&&this.#l[t]!==void 0&&!this.#a(this.#n[t])&&(yield[this.#l[t],this.#n[t]])}*rentries(){for(let t of this.#k())this.#n[t]!==void 0&&this.#l[t]!==void 0&&!this.#a(this.#n[t])&&(yield[this.#l[t],this.#n[t]])}*keys(){for(let t of this.#C()){let e=this.#l[t];e!==void 0&&!this.#a(this.#n[t])&&(yield e)}}*rkeys(){for(let t of this.#k()){let e=this.#l[t];e!==void 0&&!this.#a(this.#n[t])&&(yield e)}}*values(){for(let t of this.#C())this.#n[t]!==void 0&&!this.#a(this.#n[t])&&(yield this.#n[t])}*rvalues(){for(let t of this.#k())this.#n[t]!==void 0&&!this.#a(this.#n[t])&&(yield this.#n[t])}[Symbol.iterator](){return this.entries()}[Symbol.toStringTag]="LRUCache";find(t,e={}){for(let s of this.#C()){let i=this.#n[s],r=this.#a(i)?i.__staleWhileFetching:i;if(r!==void 0&&t(r,this.#l[s],this))return this.#V(this.#l[s],e)}}forEach(t,e=this){for(let s of this.#C()){let i=this.#n[s],r=this.#a(i)?i.__staleWhileFetching:i;r!==void 0&&t.call(e,r,this.#l[s],this)}}rforEach(t,e=this){for(let s of this.#k()){let i=this.#n[s],r=this.#a(i)?i.__staleWhileFetching:i;r!==void 0&&t.call(e,r,this.#l[s],this)}}purgeStale(){let t=!1;for(let e of this.#k({allowStale:!0}))this.#R(e)&&(this.#W(this.#l[e],"expire"),t=!0);return t}info(t){let e=this.#c.get(t);if(e===void 0)return;let s=this.#n[e],i=this.#a(s)?s.__staleWhileFetching:s;if(i===void 0)return;let r={value:i};if(this.#d&&this.#T){let o=this.#d[e],h=this.#T[e];if(o&&h){let a=o-(this.#f.now()-h);r.ttl=a,r.start=Date.now()}}return this.#E&&(r.size=this.#E[e]),r}dump(){let t=[];for(let e of this.#C({allowStale:!0})){let s=this.#l[e],i=this.#n[e],r=this.#a(i)?i.__staleWhileFetching:i;if(r===void 0||s===void 0)continue;let o={value:r};if(this.#d&&this.#T){o.ttl=this.#d[e];let h=this.#f.now()-this.#T[e];o.start=Math.floor(Date.now()-h)}this.#E&&(o.size=this.#E[e]),t.unshift([s,o])}return t}load(t){this.clear();for(let[e,s]of t){if(s.start){let i=Date.now()-s.start;s.start=this.#f.now()-i}this.#L(e,s.value,s)}}set(t,e,s={}){let{status:i=T.metrics.hasSubscribers?{}:void 0}=s;s.status=i,i&&(i.op="set",i.key=t,e!==void 0&&(i.value=e));let r=this.#L(t,e,s);return i&&T.metrics.hasSubscribers&&T.metrics.publish(i),r}#L(t,e,s={}){let{ttl:i=this.ttl,start:r,noDisposeOnSet:o=this.noDisposeOnSet,sizeCalculation:h=this.sizeCalculation,status:a}=s;if(e===void 0)return a&&(a.set="deleted"),this.delete(t),this;let{noUpdateTTL:l=this.noUpdateTTL}=s;a&&!this.#a(e)&&(a.value=e);let f=this.#z(t,e,s.size||0,h,a);if(this.maxEntrySize&&f>this.maxEntrySize)return this.#W(t,"set"),a&&(a.set="miss",a.maxEntrySizeExceeded=!0),this;let c=this.#h===0?void 0:this.#c.get(t);if(c===void 0)c=this.#h===0?this.#m:this.#x.length!==0?this.#x.pop():this.#h===this.#t?this.#U(!1):this.#h,this.#l[c]=t,this.#n[c]=e,this.#c.set(t,c),this.#y[this.#m]=c,this.#v[c]=this.#m,this.#m=c,this.#h++,this.#D(c,f,a),a&&(a.set="add"),l=!1,this.#F&&this.#e?.(e,t,"add");else{this.#K(c);let u=this.#n[c];if(e!==u){if(this.#O&&this.#a(u)){u.__abortController.abort(new Error("replaced"));let{__staleWhileFetching:p}=u;p!==void 0&&!o&&(this.#S&&this.#r?.(p,t,"set"),this.#i&&this.#g?.push([p,t,"set"]))}else o||(this.#S&&this.#r?.(u,t,"set"),this.#i&&this.#g?.push([u,t,"set"]));if(this.#j(c),this.#D(c,f,a),this.#n[c]=e,a){a.set="replace";let p=u&&this.#a(u)?u.__staleWhileFetching:u;p!==void 0&&(a.oldValue=p)}}else a&&(a.set="update");this.#F&&this.onInsert?.(e,t,e===u?"update":"replace")}if(i!==0&&!this.#d&&this.#M(),this.#d&&(l||this.#B(c,i,r),a&&this.#P(a,c)),!o&&this.#i&&this.#g){let u=this.#g,p;for(;p=u?.shift();)this.#o?.(...p)}return this}pop(){try{for(;this.#h;){let t=this.#n[this.#p];if(this.#U(!0),this.#a(t)){if(t.__staleWhileFetching)return t.__staleWhileFetching}else if(t!==void 0)return t}}finally{if(this.#i&&this.#g){let t=this.#g,e;for(;e=t?.shift();)this.#o?.(...e)}}}#U(t){let e=this.#p,s=this.#l[e],i=this.#n[e];return this.#O&&this.#a(i)?i.__abortController.abort(new Error("evicted")):(this.#S||this.#i)&&(this.#S&&this.#r?.(i,s,"evict"),this.#i&&this.#g?.push([i,s,"evict"])),this.#j(e),this.#w?.[e]&&(clearTimeout(this.#w[e]),this.#w[e]=void 0),t&&(this.#l[e]=void 0,this.#n[e]=void 0,this.#x.push(e)),this.#h===1?(this.#p=this.#m=0,this.#x.length=0):this.#p=this.#y[e],this.#c.delete(s),this.#h--,e}has(t,e={}){let{status:s=T.metrics.hasSubscribers?{}:void 0}=e;e.status=s,s&&(s.op="has",s.key=t);let i=this.#X(t,e);return T.metrics.hasSubscribers&&T.metrics.publish(s),i}#X(t,e={}){let{updateAgeOnHas:s=this.updateAgeOnHas,status:i}=e,r=this.#c.get(t);if(r!==void 0){let o=this.#n[r];if(this.#a(o)&&o.__staleWhileFetching===void 0)return!1;if(this.#R(r))i&&(i.has="stale",this.#P(i,r));else return s&&this.#A(r),i&&(i.has="hit",this.#P(i,r)),!0}else i&&(i.has="miss");return!1}peek(t,e={}){let{status:s=lt()?{}:void 0}=e;s&&(s.op="peek",s.key=t),e.status=s;let i=this.#q(t,e);return T.metrics.hasSubscribers&&T.metrics.publish(s),i}#q(t,e){let{status:s,allowStale:i=this.allowStale}=e,r=this.#c.get(t);if(r===void 0||!i&&this.#R(r)){s&&(s.peek=r===void 0?"miss":"stale");return}let o=this.#n[r],h=this.#a(o)?o.__staleWhileFetching:o;return s&&(h!==void 0?(s.peek="hit",s.value=h):s.peek="miss"),h}#N(t,e,s,i){let r=e===void 0?void 0:this.#n[e];if(this.#a(r))return r;let o=new AbortController,{signal:h}=s;h?.addEventListener("abort",()=>o.abort(h.reason),{signal:o.signal});let a={signal:o.signal,options:s,context:i},l=(d,b=!1)=>{let{aborted:m}=o.signal,y=s.ignoreFetchAbort&&d!==void 0,E=s.ignoreFetchAbort||!!(s.allowStaleOnFetchAbort&&d!==void 0);if(s.status&&(m&&!b?(s.status.fetchAborted=!0,s.status.fetchError=o.signal.reason,y&&(s.status.fetchAbortIgnored=!0)):s.status.fetchResolved=!0),m&&!y&&!b)return c(o.signal.reason,E);let S=p,v=this.#n[e];return(v===p||v===void 0&&y&&b)&&(d===void 0?S.__staleWhileFetching!==void 0?this.#n[e]=S.__staleWhileFetching:this.#W(t,"fetch"):(s.status&&(s.status.fetchUpdated=!0),this.#L(t,d,a.options))),d},f=d=>(s.status&&(s.status.fetchRejected=!0,s.status.fetchError=d),c(d,!1)),c=(d,b)=>{let{aborted:m}=o.signal,y=m&&s.allowStaleOnFetchAbort,E=y||s.allowStaleOnFetchRejection,S=E||s.noDeleteOnFetchRejection,v=p;if(this.#n[e]===p&&(!S||!b&&v.__staleWhileFetching===void 0?this.#W(t,"fetch"):y||(this.#n[e]=v.__staleWhileFetching)),E)return s.status&&v.__staleWhileFetching!==void 0&&(s.status.returnedStale=!0),v.__staleWhileFetching;if(v.__returned===v)throw d},u=(d,b)=>{let m=this.#_?.(t,r,a);m&&m instanceof Promise&&m.then(y=>d(y===void 0?void 0:y),b),o.signal.addEventListener("abort",()=>{(!s.ignoreFetchAbort||s.allowStaleOnFetchAbort)&&(d(void 0),s.allowStaleOnFetchAbort&&(d=y=>l(y,!0)))})};s.status&&(s.status.fetchDispatched=!0);let p=new Promise(u).then(l,f),w=Object.assign(p,{__abortController:o,__staleWhileFetching:r,__returned:void 0});return e===void 0?(this.#L(t,w,{...a.options,status:void 0}),e=this.#c.get(t)):this.#n[e]=w,w}#a(t){if(!this.#O)return!1;let e=t;return!!e&&e instanceof Promise&&e.hasOwnProperty("__staleWhileFetching")&&e.__abortController instanceof AbortController}fetch(t,e={}){let s=T.tracing.hasSubscribers,{status:i=lt()?{}:void 0}=e;e.status=i,i&&e.context&&(i.context=e.context);let r=this.#H(t,e);return i&&lt()&&s&&(i.trace=!0,T.tracing.tracePromise(()=>r,i).catch(()=>{})),r}async#H(t,e={}){let{allowStale:s=this.allowStale,updateAgeOnGet:i=this.updateAgeOnGet,noDeleteOnStaleGet:r=this.noDeleteOnStaleGet,ttl:o=this.ttl,noDisposeOnSet:h=this.noDisposeOnSet,size:a=0,sizeCalculation:l=this.sizeCalculation,noUpdateTTL:f=this.noUpdateTTL,noDeleteOnFetchRejection:c=this.noDeleteOnFetchRejection,allowStaleOnFetchRejection:u=this.allowStaleOnFetchRejection,ignoreFetchAbort:p=this.ignoreFetchAbort,allowStaleOnFetchAbort:w=this.allowStaleOnFetchAbort,context:d,forceRefresh:b=!1,status:m,signal:y}=e;if(m&&(m.op="fetch",m.key=t,b&&(m.forceRefresh=!0)),!this.#O)return m&&(m.fetch="get"),this.#V(t,{allowStale:s,updateAgeOnGet:i,noDeleteOnStaleGet:r,status:m});let E={allowStale:s,updateAgeOnGet:i,noDeleteOnStaleGet:r,ttl:o,noDisposeOnSet:h,size:a,sizeCalculation:l,noUpdateTTL:f,noDeleteOnFetchRejection:c,allowStaleOnFetchRejection:u,allowStaleOnFetchAbort:w,ignoreFetchAbort:p,status:m,signal:y},S=this.#c.get(t);if(S===void 0){m&&(m.fetch="miss");let v=this.#N(t,S,E,d);return v.__returned=v}else{let v=this.#n[S];if(this.#a(v)){let et=s&&v.__staleWhileFetching!==void 0;return m&&(m.fetch="inflight",et&&(m.returnedStale=!0)),et?v.__staleWhileFetching:v.__returned=v}let V=this.#R(S);if(!b&&!V)return m&&(m.fetch="hit"),this.#K(S),i&&this.#A(S),m&&this.#P(m,S),v;let I=this.#N(t,S,E,d),tt=I.__staleWhileFetching!==void 0&&s;return m&&(m.fetch=V?"stale":"refresh",tt&&V&&(m.returnedStale=!0)),tt?I.__staleWhileFetching:I.__returned=I}}forceFetch(t,e={}){let s=T.tracing.hasSubscribers,{status:i=lt()?{}:void 0}=e;e.status=i,i&&e.context&&(i.context=e.context);let r=this.#$(t,e);return i&&lt()&&s&&(i.trace=!0,T.tracing.tracePromise(()=>r,i).catch(()=>{})),r}async#$(t,e={}){let s=await this.#H(t,e);if(s===void 0)throw new Error("fetch() returned undefined");return s}memo(t,e={}){let{status:s=T.metrics.hasSubscribers?{}:void 0}=e;e.status=s,s&&(s.op="memo",s.key=t,e.context&&(s.context=e.context));let i=this.#Z(t,e);return s&&(s.value=i),T.metrics.hasSubscribers&&T.metrics.publish(s),i}#Z(t,e={}){let s=this.#b;if(!s)throw new Error("no memoMethod provided to constructor");let{context:i,status:r,forceRefresh:o,...h}=e;r&&o&&(r.forceRefresh=!0);let a=this.#V(t,h),l=o||a===void 0;if(r&&(r.memo=l?"miss":"hit",l||(r.value=a)),!l)return a;let f=s(t,a,{options:h,context:i});return r&&(r.value=f),this.#L(t,f,h),f}get(t,e={}){let{status:s=T.metrics.hasSubscribers?{}:void 0}=e;e.status=s,s&&(s.op="get",s.key=t);let i=this.#V(t,e);return s&&(i!==void 0&&(s.value=i),T.metrics.hasSubscribers&&T.metrics.publish(s)),i}#V(t,e={}){let{allowStale:s=this.allowStale,updateAgeOnGet:i=this.updateAgeOnGet,noDeleteOnStaleGet:r=this.noDeleteOnStaleGet,status:o}=e,h=this.#c.get(t);if(h===void 0){o&&(o.get="miss");return}let a=this.#n[h],l=this.#a(a);return o&&this.#P(o,h),this.#R(h)?l?(o&&(o.get="stale-fetching"),s&&a.__staleWhileFetching!==void 0?(o&&(o.returnedStale=!0),a.__staleWhileFetching):void 0):(r||this.#W(t,"expire"),o&&(o.get="stale"),s?(o&&(o.returnedStale=!0),a):void 0):(o&&(o.get=l?"fetching":"hit"),this.#K(h),i&&this.#A(h),l?a.__staleWhileFetching:a)}#Y(t,e){this.#v[e]=t,this.#y[t]=e}#K(t){t!==this.#m&&(t===this.#p?this.#p=this.#y[t]:this.#Y(this.#v[t],this.#y[t]),this.#Y(this.#m,t),this.#m=t)}delete(t){return this.#W(t,"delete")}#W(t,e){T.metrics.hasSubscribers&&T.metrics.publish({op:"delete",delete:e,key:t});let s=!1;if(this.#h!==0){let i=this.#c.get(t);if(i!==void 0)if(this.#w?.[i]&&(clearTimeout(this.#w?.[i]),this.#w[i]=void 0),s=!0,this.#h===1)this.#J(e);else{this.#j(i);let r=this.#n[i];if(this.#a(r)?r.__abortController.abort(new Error("deleted")):(this.#S||this.#i)&&(this.#S&&this.#r?.(r,t,e),this.#i&&this.#g?.push([r,t,e])),this.#c.delete(t),this.#l[i]=void 0,this.#n[i]=void 0,i===this.#m)this.#m=this.#v[i];else if(i===this.#p)this.#p=this.#y[i];else{let o=this.#v[i];this.#y[o]=this.#y[i];let h=this.#y[i];this.#v[h]=this.#v[i]}this.#h--,this.#x.push(i)}}if(this.#i&&this.#g?.length){let i=this.#g,r;for(;r=i?.shift();)this.#o?.(...r)}return s}clear(){return this.#J("delete")}#J(t){for(let e of this.#k({allowStale:!0})){let s=this.#n[e];if(this.#a(s))s.__abortController.abort(new Error("deleted"));else{let i=this.#l[e];this.#S&&this.#r?.(s,i,t),this.#i&&this.#g?.push([s,i,t])}}if(this.#c.clear(),this.#n.fill(void 0),this.#l.fill(void 0),this.#d&&this.#T){this.#d.fill(0),this.#T.fill(0);for(let e of this.#w??[])e!==void 0&&clearTimeout(e);this.#w?.fill(void 0)}if(this.#E&&this.#E.fill(0),this.#p=0,this.#m=0,this.#x.length=0,this.#u=0,this.#h=0,this.#i&&this.#g){let e=this.#g,s;for(;s=e?.shift();)this.#o?.(...s)}}};Nt.LRUCache=tr});var hs=k(F=>{"use strict";var er=F&&F.__importDefault||function(n){return n&&n.__esModule?n:{default:n}};Object.defineProperty(F,"__esModule",{value:!0});F.Minipass=F.isWritable=F.isReadable=F.isStream=void 0;var ss=typeof process=="object"&&process?process:{stdout:null,stderr:null},Se=__nccwpck_require__(8474),os=er(__nccwpck_require__(7075)),sr=__nccwpck_require__(6193),ir=n=>!!n&&typeof n=="object"&&(n instanceof It||n instanceof os.default||(0,F.isReadable)(n)||(0,F.isWritable)(n));F.isStream=ir;var rr=n=>!!n&&typeof n=="object"&&n instanceof Se.EventEmitter&&typeof n.pipe=="function"&&n.pipe!==os.default.Writable.prototype.pipe;F.isReadable=rr;var nr=n=>!!n&&typeof n=="object"&&n instanceof Se.EventEmitter&&typeof n.write=="function"&&typeof n.end=="function";F.isWritable=nr;var q=Symbol("EOF"),H=Symbol("maybeEmitEnd"),X=Symbol("emittedEnd"),Wt=Symbol("emittingEnd"),ft=Symbol("emittedError"),Bt=Symbol("closed"),is=Symbol("read"),zt=Symbol("flush"),rs=Symbol("flushChunk"),B=Symbol("encoding"),it=Symbol("decoder"),x=Symbol("flowing"),ut=Symbol("paused"),rt=Symbol("resume"),O=Symbol("buffer"),P=Symbol("pipes"),A=Symbol("bufferLength"),pe=Symbol("bufferPush"),Gt=Symbol("bufferShift"),M=Symbol("objectMode"),R=Symbol("destroyed"),me=Symbol("error"),ge=Symbol("emitData"),ns=Symbol("emitEnd"),we=Symbol("emitEnd2"),G=Symbol("async"),be=Symbol("abort"),$t=Symbol("aborted"),dt=Symbol("signal"),Z=Symbol("dataListeners"),j=Symbol("discarded"),pt=n=>Promise.resolve().then(n),or=n=>n(),hr=n=>n==="end"||n==="finish"||n==="prefinish",ar=n=>n instanceof ArrayBuffer||!!n&&typeof n=="object"&&n.constructor&&n.constructor.name==="ArrayBuffer"&&n.byteLength>=0,lr=n=>!Buffer.isBuffer(n)&&ArrayBuffer.isView(n),Ut=class{src;dest;opts;ondrain;constructor(t,e,s){this.src=t,this.dest=e,this.opts=s,this.ondrain=()=>t[rt](),this.dest.on("drain",this.ondrain)}unpipe(){this.dest.removeListener("drain",this.ondrain)}proxyErrors(t){}end(){this.unpipe(),this.opts.end&&this.dest.end()}},ye=class extends Ut{unpipe(){this.src.removeListener("error",this.proxyErrors),super.unpipe()}constructor(t,e,s){super(t,e,s),this.proxyErrors=i=>this.dest.emit("error",i),t.on("error",this.proxyErrors)}},cr=n=>!!n.objectMode,fr=n=>!n.objectMode&&!!n.encoding&&n.encoding!=="buffer",It=class extends Se.EventEmitter{[x]=!1;[ut]=!1;[P]=[];[O]=[];[M];[B];[G];[it];[q]=!1;[X]=!1;[Wt]=!1;[Bt]=!1;[ft]=null;[A]=0;[R]=!1;[dt];[$t]=!1;[Z]=0;[j]=!1;writable=!0;readable=!0;constructor(...t){let e=t[0]||{};if(super(),e.objectMode&&typeof e.encoding=="string")throw new TypeError("Encoding and objectMode may not be used together");cr(e)?(this[M]=!0,this[B]=null):fr(e)?(this[B]=e.encoding,this[M]=!1):(this[M]=!1,this[B]=null),this[G]=!!e.async,this[it]=this[B]?new sr.StringDecoder(this[B]):null,e&&e.debugExposeBuffer===!0&&Object.defineProperty(this,"buffer",{get:()=>this[O]}),e&&e.debugExposePipes===!0&&Object.defineProperty(this,"pipes",{get:()=>this[P]});let{signal:s}=e;s&&(this[dt]=s,s.aborted?this[be]():s.addEventListener("abort",()=>this[be]()))}get bufferLength(){return this[A]}get encoding(){return this[B]}set encoding(t){throw new Error("Encoding must be set at instantiation time")}setEncoding(t){throw new Error("Encoding must be set at instantiation time")}get objectMode(){return this[M]}set objectMode(t){throw new Error("objectMode must be set at instantiation time")}get async(){return this[G]}set async(t){this[G]=this[G]||!!t}[be](){this[$t]=!0,this.emit("abort",this[dt]?.reason),this.destroy(this[dt]?.reason)}get aborted(){return this[$t]}set aborted(t){}write(t,e,s){if(this[$t])return!1;if(this[q])throw new Error("write after end");if(this[R])return this.emit("error",Object.assign(new Error("Cannot call write after a stream was destroyed"),{code:"ERR_STREAM_DESTROYED"})),!0;typeof e=="function"&&(s=e,e="utf8"),e||(e="utf8");let i=this[G]?pt:or;if(!this[M]&&!Buffer.isBuffer(t)){if(lr(t))t=Buffer.from(t.buffer,t.byteOffset,t.byteLength);else if(ar(t))t=Buffer.from(t);else if(typeof t!="string")throw new Error("Non-contiguous data written to non-objectMode stream")}return this[M]?(this[x]&&this[A]!==0&&this[zt](!0),this[x]?this.emit("data",t):this[pe](t),this[A]!==0&&this.emit("readable"),s&&i(s),this[x]):t.length?(typeof t=="string"&&!(e===this[B]&&!this[it]?.lastNeed)&&(t=Buffer.from(t,e)),Buffer.isBuffer(t)&&this[B]&&(t=this[it].write(t)),this[x]&&this[A]!==0&&this[zt](!0),this[x]?this.emit("data",t):this[pe](t),this[A]!==0&&this.emit("readable"),s&&i(s),this[x]):(this[A]!==0&&this.emit("readable"),s&&i(s),this[x])}read(t){if(this[R])return null;if(this[j]=!1,this[A]===0||t===0||t&&t>this[A])return this[H](),null;this[M]&&(t=null),this[O].length>1&&!this[M]&&(this[O]=[this[B]?this[O].join(""):Buffer.concat(this[O],this[A])]);let e=this[is](t||null,this[O][0]);return this[H](),e}[is](t,e){if(this[M])this[Gt]();else{let s=e;t===s.length||t===null?this[Gt]():typeof s=="string"?(this[O][0]=s.slice(t),e=s.slice(0,t),this[A]-=t):(this[O][0]=s.subarray(t),e=s.subarray(0,t),this[A]-=t)}return this.emit("data",e),!this[O].length&&!this[q]&&this.emit("drain"),e}end(t,e,s){return typeof t=="function"&&(s=t,t=void 0),typeof e=="function"&&(s=e,e="utf8"),t!==void 0&&this.write(t,e),s&&this.once("end",s),this[q]=!0,this.writable=!1,(this[x]||!this[ut])&&this[H](),this}[rt](){this[R]||(!this[Z]&&!this[P].length&&(this[j]=!0),this[ut]=!1,this[x]=!0,this.emit("resume"),this[O].length?this[zt]():this[q]?this[H]():this.emit("drain"))}resume(){return this[rt]()}pause(){this[x]=!1,this[ut]=!0,this[j]=!1}get destroyed(){return this[R]}get flowing(){return this[x]}get paused(){return this[ut]}[pe](t){this[M]?this[A]+=1:this[A]+=t.length,this[O].push(t)}[Gt](){return this[M]?this[A]-=1:this[A]-=this[O][0].length,this[O].shift()}[zt](t=!1){do;while(this[rs](this[Gt]())&&this[O].length);!t&&!this[O].length&&!this[q]&&this.emit("drain")}[rs](t){return this.emit("data",t),this[x]}pipe(t,e){if(this[R])return t;this[j]=!1;let s=this[X];return e=e||{},t===ss.stdout||t===ss.stderr?e.end=!1:e.end=e.end!==!1,e.proxyErrors=!!e.proxyErrors,s?e.end&&t.end():(this[P].push(e.proxyErrors?new ye(this,t,e):new Ut(this,t,e)),this[G]?pt(()=>this[rt]()):this[rt]()),t}unpipe(t){let e=this[P].find(s=>s.dest===t);e&&(this[P].length===1?(this[x]&&this[Z]===0&&(this[x]=!1),this[P]=[]):this[P].splice(this[P].indexOf(e),1),e.unpipe())}addListener(t,e){return this.on(t,e)}on(t,e){let s=super.on(t,e);if(t==="data")this[j]=!1,this[Z]++,!this[P].length&&!this[x]&&this[rt]();else if(t==="readable"&&this[A]!==0)super.emit("readable");else if(hr(t)&&this[X])super.emit(t),this.removeAllListeners(t);else if(t==="error"&&this[ft]){let i=e;this[G]?pt(()=>i.call(this,this[ft])):i.call(this,this[ft])}return s}removeListener(t,e){return this.off(t,e)}off(t,e){let s=super.off(t,e);return t==="data"&&(this[Z]=this.listeners("data").length,this[Z]===0&&!this[j]&&!this[P].length&&(this[x]=!1)),s}removeAllListeners(t){let e=super.removeAllListeners(t);return(t==="data"||t===void 0)&&(this[Z]=0,!this[j]&&!this[P].length&&(this[x]=!1)),e}get emittedEnd(){return this[X]}[H](){!this[Wt]&&!this[X]&&!this[R]&&this[O].length===0&&this[q]&&(this[Wt]=!0,this.emit("end"),this.emit("prefinish"),this.emit("finish"),this[Bt]&&this.emit("close"),this[Wt]=!1)}emit(t,...e){let s=e[0];if(t!=="error"&&t!=="close"&&t!==R&&this[R])return!1;if(t==="data")return!this[M]&&!s?!1:this[G]?(pt(()=>this[ge](s)),!0):this[ge](s);if(t==="end")return this[ns]();if(t==="close"){if(this[Bt]=!0,!this[X]&&!this[R])return!1;let r=super.emit("close");return this.removeAllListeners("close"),r}else if(t==="error"){this[ft]=s,super.emit(me,s);let r=!this[dt]||this.listeners("error").length?super.emit("error",s):!1;return this[H](),r}else if(t==="resume"){let r=super.emit("resume");return this[H](),r}else if(t==="finish"||t==="prefinish"){let r=super.emit(t);return this.removeAllListeners(t),r}let i=super.emit(t,...e);return this[H](),i}[ge](t){for(let s of this[P])s.dest.write(t)===!1&&this.pause();let e=this[j]?!1:super.emit("data",t);return this[H](),e}[ns](){return this[X]?!1:(this[X]=!0,this.readable=!1,this[G]?(pt(()=>this[we]()),!0):this[we]())}[we](){if(this[it]){let e=this[it].end();if(e){for(let s of this[P])s.dest.write(e);this[j]||super.emit("data",e)}}for(let e of this[P])e.end();let t=super.emit("end");return this.removeAllListeners("end"),t}async collect(){let t=Object.assign([],{dataLength:0});this[M]||(t.dataLength=0);let e=this.promise();return this.on("data",s=>{t.push(s),this[M]||(t.dataLength+=s.length)}),await e,t}async concat(){if(this[M])throw new Error("cannot concat in objectMode");let t=await this.collect();return this[B]?t.join(""):Buffer.concat(t,t.dataLength)}async promise(){return new Promise((t,e)=>{this.on(R,()=>e(new Error("stream destroyed"))),this.on("error",s=>e(s)),this.on("end",()=>t())})}[Symbol.asyncIterator](){this[j]=!1;let t=!1,e=async()=>(this.pause(),t=!0,{value:void 0,done:!0});return{next:()=>{if(t)return e();let i=this.read();if(i!==null)return Promise.resolve({done:!1,value:i});if(this[q])return e();let r,o,h=c=>{this.off("data",a),this.off("end",l),this.off(R,f),e(),o(c)},a=c=>{this.off("error",h),this.off("end",l),this.off(R,f),this.pause(),r({value:c,done:!!this[q]})},l=()=>{this.off("error",h),this.off("data",a),this.off(R,f),e(),r({done:!0,value:void 0})},f=()=>h(new Error("stream destroyed"));return new Promise((c,u)=>{o=u,r=c,this.once(R,f),this.once("error",h),this.once("end",l),this.once("data",a)})},throw:e,return:e,[Symbol.asyncIterator](){return this},[Symbol.asyncDispose]:async()=>{}}}[Symbol.iterator](){this[j]=!1;let t=!1,e=()=>(this.pause(),this.off(me,e),this.off(R,e),this.off("end",e),t=!0,{done:!0,value:void 0}),s=()=>{if(t)return e();let i=this.read();return i===null?e():{done:!1,value:i}};return this.once("end",e),this.once(me,e),this.once(R,e),{next:s,throw:e,return:e,[Symbol.iterator](){return this},[Symbol.dispose]:()=>{}}}destroy(t){if(this[R])return t?this.emit("error",t):this.emit(R),this;this[R]=!0,this[j]=!0,this[O].length=0,this[A]=0;let e=this;return typeof e.close=="function"&&!this[Bt]&&e.close(),t?this.emit("error",t):this.emit(R),this}static get isStream(){return F.isStream}};F.Minipass=It});var vs=k(_=>{"use strict";var ur=_&&_.__createBinding||(Object.create?(function(n,t,e,s){s===void 0&&(s=e);var i=Object.getOwnPropertyDescriptor(t,e);(!i||("get"in i?!t.__esModule:i.writable||i.configurable))&&(i={enumerable:!0,get:function(){return t[e]}}),Object.defineProperty(n,s,i)}):(function(n,t,e,s){s===void 0&&(s=e),n[s]=t[e]})),dr=_&&_.__setModuleDefault||(Object.create?(function(n,t){Object.defineProperty(n,"default",{enumerable:!0,value:t})}):function(n,t){n.default=t}),pr=_&&_.__importStar||function(n){if(n&&n.__esModule)return n;var t={};if(n!=null)for(var e in n)e!=="default"&&Object.prototype.hasOwnProperty.call(n,e)&&ur(t,n,e);return dr(t,n),t};Object.defineProperty(_,"__esModule",{value:!0});_.PathScurry=_.Path=_.PathScurryDarwin=_.PathScurryPosix=_.PathScurryWin32=_.PathScurryBase=_.PathPosix=_.PathWin32=_.PathBase=_.ChildrenCache=_.ResolveCache=void 0;var Zt=es(),Xt=__nccwpck_require__(6760),mr=__nccwpck_require__(3136),gt=__nccwpck_require__(9896),gr=pr(__nccwpck_require__(3024)),wr=gt.realpathSync.native,qt=__nccwpck_require__(1455),as=hs(),wt={lstatSync:gt.lstatSync,readdir:gt.readdir,readdirSync:gt.readdirSync,readlinkSync:gt.readlinkSync,realpathSync:wr,promises:{lstat:qt.lstat,readdir:qt.readdir,readlink:qt.readlink,realpath:qt.realpath}},ds=n=>!n||n===wt||n===gr?wt:{...wt,...n,promises:{...wt.promises,...n.promises||{}}},ps=/^\\\\\?\\([a-z]:)\\?$/i,br=n=>n.replace(/\//g,"\\").replace(ps,"$1\\"),yr=/[\\\/]/,W=0,ms=1,gs=2,$=4,ws=6,bs=8,Q=10,ys=12,N=15,mt=~N,ve=16,ls=32,bt=64,z=128,Ht=256,Kt=512,cs=bt|z|Kt,Sr=1023,Ee=n=>n.isFile()?bs:n.isDirectory()?$:n.isSymbolicLink()?Q:n.isCharacterDevice()?gs:n.isBlockDevice()?ws:n.isSocket()?ys:n.isFIFO()?ms:W,fs=new Zt.LRUCache({max:2**12}),yt=n=>{let t=fs.get(n);if(t)return t;let e=n.normalize("NFKD");return fs.set(n,e),e},us=new Zt.LRUCache({max:2**12}),Vt=n=>{let t=us.get(n);if(t)return t;let e=yt(n.toLowerCase());return us.set(n,e),e},St=class extends Zt.LRUCache{constructor(){super({max:256})}};_.ResolveCache=St;var Yt=class extends Zt.LRUCache{constructor(t=16*1024){super({maxSize:t,sizeCalculation:e=>e.length+1})}};_.ChildrenCache=Yt;var Ss=Symbol("PathScurry setAsCwd"),C=class{name;root;roots;parent;nocase;isCWD=!1;#t;#s;get dev(){return this.#s}#r;get mode(){return this.#r}#e;get nlink(){return this.#e}#o;get uid(){return this.#o}#_;get gid(){return this.#_}#b;get rdev(){return this.#b}#f;get blksize(){return this.#f}#h;get ino(){return this.#h}#u;get size(){return this.#u}#c;get blocks(){return this.#c}#l;get atimeMs(){return this.#l}#n;get mtimeMs(){return this.#n}#y;get ctimeMs(){return this.#y}#v;get birthtimeMs(){return this.#v}#p;get atime(){return this.#p}#m;get mtime(){return this.#m}#x;get ctime(){return this.#x}#g;get birthtime(){return this.#g}#E;#T;#d;#w;#S;#O;#i;#F;#M;#A;get parentPath(){return(this.parent||this).fullpath()}get path(){return this.parentPath}constructor(t,e=W,s,i,r,o,h){this.name=t,this.#E=r?Vt(t):yt(t),this.#i=e&Sr,this.nocase=r,this.roots=i,this.root=s||this,this.#F=o,this.#d=h.fullpath,this.#S=h.relative,this.#O=h.relativePosix,this.parent=h.parent,this.parent?this.#t=this.parent.#t:this.#t=ds(h.fs)}depth(){return this.#T!==void 0?this.#T:this.parent?this.#T=this.parent.depth()+1:this.#T=0}childrenCache(){return this.#F}resolve(t){if(!t)return this;let e=this.getRootString(t),i=t.substring(e.length).split(this.splitSep);return e?this.getRoot(e).#P(i):this.#P(i)}#P(t){let e=this;for(let s of t)e=e.child(s);return e}children(){let t=this.#F.get(this);if(t)return t;let e=Object.assign([],{provisional:0});return this.#F.set(this,e),this.#i&=~ve,e}child(t,e){if(t===""||t===".")return this;if(t==="..")return this.parent||this;let s=this.children(),i=this.nocase?Vt(t):yt(t);for(let a of s)if(a.#E===i)return a;let r=this.parent?this.sep:"",o=this.#d?this.#d+r+t:void 0,h=this.newChild(t,W,{...e,parent:this,fullpath:o});return this.canReaddir()||(h.#i|=z),s.push(h),h}relative(){if(this.isCWD)return"";if(this.#S!==void 0)return this.#S;let t=this.name,e=this.parent;if(!e)return this.#S=this.name;let s=e.relative();return s+(!s||!e.parent?"":this.sep)+t}relativePosix(){if(this.sep==="/")return this.relative();if(this.isCWD)return"";if(this.#O!==void 0)return this.#O;let t=this.name,e=this.parent;if(!e)return this.#O=this.fullpathPosix();let s=e.relativePosix();return s+(!s||!e.parent?"":"/")+t}fullpath(){if(this.#d!==void 0)return this.#d;let t=this.name,e=this.parent;if(!e)return this.#d=this.name;let i=e.fullpath()+(e.parent?this.sep:"")+t;return this.#d=i}fullpathPosix(){if(this.#w!==void 0)return this.#w;if(this.sep==="/")return this.#w=this.fullpath();if(!this.parent){let i=this.fullpath().replace(/\\/g,"/");return/^[a-z]:\//i.test(i)?this.#w=`//?/${i}`:this.#w=i}let t=this.parent,e=t.fullpathPosix(),s=e+(!e||!t.parent?"":"/")+this.name;return this.#w=s}isUnknown(){return(this.#i&N)===W}isType(t){return this[`is${t}`]()}getType(){return this.isUnknown()?"Unknown":this.isDirectory()?"Directory":this.isFile()?"File":this.isSymbolicLink()?"SymbolicLink":this.isFIFO()?"FIFO":this.isCharacterDevice()?"CharacterDevice":this.isBlockDevice()?"BlockDevice":this.isSocket()?"Socket":"Unknown"}isFile(){return(this.#i&N)===bs}isDirectory(){return(this.#i&N)===$}isCharacterDevice(){return(this.#i&N)===gs}isBlockDevice(){return(this.#i&N)===ws}isFIFO(){return(this.#i&N)===ms}isSocket(){return(this.#i&N)===ys}isSymbolicLink(){return(this.#i&Q)===Q}lstatCached(){return this.#i&ls?this:void 0}readlinkCached(){return this.#M}realpathCached(){return this.#A}readdirCached(){let t=this.children();return t.slice(0,t.provisional)}canReadlink(){if(this.#M)return!0;if(!this.parent)return!1;let t=this.#i&N;return!(t!==W&&t!==Q||this.#i&Ht||this.#i&z)}calledReaddir(){return!!(this.#i&ve)}isENOENT(){return!!(this.#i&z)}isNamed(t){return this.nocase?this.#E===Vt(t):this.#E===yt(t)}async readlink(){let t=this.#M;if(t)return t;if(this.canReadlink()&&this.parent)try{let e=await this.#t.promises.readlink(this.fullpath()),s=(await this.parent.realpath())?.resolve(e);if(s)return this.#M=s}catch(e){this.#k(e.code);return}}readlinkSync(){let t=this.#M;if(t)return t;if(this.canReadlink()&&this.parent)try{let e=this.#t.readlinkSync(this.fullpath()),s=this.parent.realpathSync()?.resolve(e);if(s)return this.#M=s}catch(e){this.#k(e.code);return}}#B(t){this.#i|=ve;for(let e=t.provisional;e<t.length;e++){let s=t[e];s&&s.#R()}}#R(){this.#i&z||(this.#i=(this.#i|z)&mt,this.#I())}#I(){let t=this.children();t.provisional=0;for(let e of t)e.#R()}#j(){this.#i|=Kt,this.#D()}#D(){if(this.#i&bt)return;let t=this.#i;(t&N)===$&&(t&=mt),this.#i=t|bt,this.#I()}#z(t=""){t==="ENOTDIR"||t==="EPERM"?this.#D():t==="ENOENT"?this.#R():this.children().provisional=0}#C(t=""){t==="ENOTDIR"?this.parent.#D():t==="ENOENT"&&this.#R()}#k(t=""){let e=this.#i;e|=Ht,t==="ENOENT"&&(e|=z),(t==="EINVAL"||t==="UNKNOWN")&&(e&=mt),this.#i=e,t==="ENOTDIR"&&this.parent&&this.parent.#D()}#G(t,e){return this.#U(t,e)||this.#L(t,e)}#L(t,e){let s=Ee(t),i=this.newChild(t.name,s,{parent:this}),r=i.#i&N;return r!==$&&r!==Q&&r!==W&&(i.#i|=bt),e.unshift(i),e.provisional++,i}#U(t,e){for(let s=e.provisional;s<e.length;s++){let i=e[s];if((this.nocase?Vt(t.name):yt(t.name))===i.#E)return this.#X(t,i,s,e)}}#X(t,e,s,i){let r=e.name;return e.#i=e.#i&mt|Ee(t),r!==t.name&&(e.name=t.name),s!==i.provisional&&(s===i.length-1?i.pop():i.splice(s,1),i.unshift(e)),i.provisional++,e}async lstat(){if((this.#i&z)===0)try{return this.#q(await this.#t.promises.lstat(this.fullpath())),this}catch(t){this.#C(t.code)}}lstatSync(){if((this.#i&z)===0)try{return this.#q(this.#t.lstatSync(this.fullpath())),this}catch(t){this.#C(t.code)}}#q(t){let{atime:e,atimeMs:s,birthtime:i,birthtimeMs:r,blksize:o,blocks:h,ctime:a,ctimeMs:l,dev:f,gid:c,ino:u,mode:p,mtime:w,mtimeMs:d,nlink:b,rdev:m,size:y,uid:E}=t;this.#p=e,this.#l=s,this.#g=i,this.#v=r,this.#f=o,this.#c=h,this.#x=a,this.#y=l,this.#s=f,this.#_=c,this.#h=u,this.#r=p,this.#m=w,this.#n=d,this.#e=b,this.#b=m,this.#u=y,this.#o=E;let S=Ee(t);this.#i=this.#i&mt|S|ls,S!==W&&S!==$&&S!==Q&&(this.#i|=bt)}#N=[];#a=!1;#H(t){this.#a=!1;let e=this.#N.slice();this.#N.length=0,e.forEach(s=>s(null,t))}readdirCB(t,e=!1){if(!this.canReaddir()){e?t(null,[]):queueMicrotask(()=>t(null,[]));return}let s=this.children();if(this.calledReaddir()){let r=s.slice(0,s.provisional);e?t(null,r):queueMicrotask(()=>t(null,r));return}if(this.#N.push(t),this.#a)return;this.#a=!0;let i=this.fullpath();this.#t.readdir(i,{withFileTypes:!0},(r,o)=>{if(r)this.#z(r.code),s.provisional=0;else{for(let h of o)this.#G(h,s);this.#B(s)}this.#H(s.slice(0,s.provisional))})}#$;async readdir(){if(!this.canReaddir())return[];let t=this.children();if(this.calledReaddir())return t.slice(0,t.provisional);let e=this.fullpath();if(this.#$)await this.#$;else{let s=()=>{};this.#$=new Promise(i=>s=i);try{for(let i of await this.#t.promises.readdir(e,{withFileTypes:!0}))this.#G(i,t);this.#B(t)}catch(i){this.#z(i.code),t.provisional=0}this.#$=void 0,s()}return t.slice(0,t.provisional)}readdirSync(){if(!this.canReaddir())return[];let t=this.children();if(this.calledReaddir())return t.slice(0,t.provisional);let e=this.fullpath();try{for(let s of this.#t.readdirSync(e,{withFileTypes:!0}))this.#G(s,t);this.#B(t)}catch(s){this.#z(s.code),t.provisional=0}return t.slice(0,t.provisional)}canReaddir(){if(this.#i&cs)return!1;let t=N&this.#i;return t===W||t===$||t===Q}shouldWalk(t,e){return(this.#i&$)===$&&!(this.#i&cs)&&!t.has(this)&&(!e||e(this))}async realpath(){if(this.#A)return this.#A;if(!((Kt|Ht|z)&this.#i))try{let t=await this.#t.promises.realpath(this.fullpath());return this.#A=this.resolve(t)}catch{this.#j()}}realpathSync(){if(this.#A)return this.#A;if(!((Kt|Ht|z)&this.#i))try{let t=this.#t.realpathSync(this.fullpath());return this.#A=this.resolve(t)}catch{this.#j()}}[Ss](t){if(t===this)return;t.isCWD=!1,this.isCWD=!0;let e=new Set([]),s=[],i=this;for(;i&&i.parent;)e.add(i),i.#S=s.join(this.sep),i.#O=s.join("/"),i=i.parent,s.push("..");for(i=t;i&&i.parent&&!e.has(i);)i.#S=void 0,i.#O=void 0,i=i.parent}};_.PathBase=C;var vt=class n extends C{sep="\\";splitSep=yr;constructor(t,e=W,s,i,r,o,h){super(t,e,s,i,r,o,h)}newChild(t,e=W,s={}){return new n(t,e,this.root,this.roots,this.nocase,this.childrenCache(),s)}getRootString(t){return Xt.win32.parse(t).root}getRoot(t){if(t=br(t.toUpperCase()),t===this.root.name)return this.root;for(let[e,s]of Object.entries(this.roots))if(this.sameRoot(t,e))return this.roots[t]=s;return this.roots[t]=new Tt(t,this).root}sameRoot(t,e=this.root.name){return t=t.toUpperCase().replace(/\//g,"\\").replace(ps,"$1\\"),t===e}};_.PathWin32=vt;var Et=class n extends C{splitSep="/";sep="/";constructor(t,e=W,s,i,r,o,h){super(t,e,s,i,r,o,h)}getRootString(t){return t.startsWith("/")?"/":""}getRoot(t){return this.root}newChild(t,e=W,s={}){return new n(t,e,this.root,this.roots,this.nocase,this.childrenCache(),s)}};_.PathPosix=Et;var _t=class{root;rootPath;roots;cwd;#t;#s;#r;nocase;#e;constructor(t=process.cwd(),e,s,{nocase:i,childrenCacheSize:r=16*1024,fs:o=wt}={}){this.#e=ds(o),(t instanceof URL||t.startsWith("file://"))&&(t=(0,mr.fileURLToPath)(t));let h=e.resolve(t);this.roots=Object.create(null),this.rootPath=this.parseRootPath(h),this.#t=new St,this.#s=new St,this.#r=new Yt(r);let a=h.substring(this.rootPath.length).split(s);if(a.length===1&&!a[0]&&a.pop(),i===void 0)throw new TypeError("must provide nocase setting to PathScurryBase ctor");this.nocase=i,this.root=this.newRoot(this.#e),this.roots[this.rootPath]=this.root;let l=this.root,f=a.length-1,c=e.sep,u=this.rootPath,p=!1;for(let w of a){let d=f--;l=l.child(w,{relative:new Array(d).fill("..").join(c),relativePosix:new Array(d).fill("..").join("/"),fullpath:u+=(p?"":c)+w}),p=!0}this.cwd=l}depth(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.depth()}childrenCache(){return this.#r}resolve(...t){let e="";for(let r=t.length-1;r>=0;r--){let o=t[r];if(!(!o||o===".")&&(e=e?`${o}/${e}`:o,this.isAbsolute(o)))break}let s=this.#t.get(e);if(s!==void 0)return s;let i=this.cwd.resolve(e).fullpath();return this.#t.set(e,i),i}resolvePosix(...t){let e="";for(let r=t.length-1;r>=0;r--){let o=t[r];if(!(!o||o===".")&&(e=e?`${o}/${e}`:o,this.isAbsolute(o)))break}let s=this.#s.get(e);if(s!==void 0)return s;let i=this.cwd.resolve(e).fullpathPosix();return this.#s.set(e,i),i}relative(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.relative()}relativePosix(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.relativePosix()}basename(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.name}dirname(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),(t.parent||t).fullpath()}async readdir(t=this.cwd,e={withFileTypes:!0}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s}=e;if(t.canReaddir()){let i=await t.readdir();return s?i:i.map(r=>r.name)}else return[]}readdirSync(t=this.cwd,e={withFileTypes:!0}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0}=e;return t.canReaddir()?s?t.readdirSync():t.readdirSync().map(i=>i.name):[]}async lstat(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.lstat()}lstatSync(t=this.cwd){return typeof t=="string"&&(t=this.cwd.resolve(t)),t.lstatSync()}async readlink(t=this.cwd,{withFileTypes:e}={withFileTypes:!1}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t.withFileTypes,t=this.cwd);let s=await t.readlink();return e?s:s?.fullpath()}readlinkSync(t=this.cwd,{withFileTypes:e}={withFileTypes:!1}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t.withFileTypes,t=this.cwd);let s=t.readlinkSync();return e?s:s?.fullpath()}async realpath(t=this.cwd,{withFileTypes:e}={withFileTypes:!1}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t.withFileTypes,t=this.cwd);let s=await t.realpath();return e?s:s?.fullpath()}realpathSync(t=this.cwd,{withFileTypes:e}={withFileTypes:!1}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t.withFileTypes,t=this.cwd);let s=t.realpathSync();return e?s:s?.fullpath()}async walk(t=this.cwd,e={}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0,follow:i=!1,filter:r,walkFilter:o}=e,h=[];(!r||r(t))&&h.push(s?t:t.fullpath());let a=new Set,l=(c,u)=>{a.add(c),c.readdirCB((p,w)=>{if(p)return u(p);let d=w.length;if(!d)return u();let b=()=>{--d===0&&u()};for(let m of w)(!r||r(m))&&h.push(s?m:m.fullpath()),i&&m.isSymbolicLink()?m.realpath().then(y=>y?.isUnknown()?y.lstat():y).then(y=>y?.shouldWalk(a,o)?l(y,b):b()):m.shouldWalk(a,o)?l(m,b):b()},!0)},f=t;return new Promise((c,u)=>{l(f,p=>{if(p)return u(p);c(h)})})}walkSync(t=this.cwd,e={}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0,follow:i=!1,filter:r,walkFilter:o}=e,h=[];(!r||r(t))&&h.push(s?t:t.fullpath());let a=new Set([t]);for(let l of a){let f=l.readdirSync();for(let c of f){(!r||r(c))&&h.push(s?c:c.fullpath());let u=c;if(c.isSymbolicLink()){if(!(i&&(u=c.realpathSync())))continue;u.isUnknown()&&u.lstatSync()}u.shouldWalk(a,o)&&a.add(u)}}return h}[Symbol.asyncIterator](){return this.iterate()}iterate(t=this.cwd,e={}){return typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd),this.stream(t,e)[Symbol.asyncIterator]()}[Symbol.iterator](){return this.iterateSync()}*iterateSync(t=this.cwd,e={}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0,follow:i=!1,filter:r,walkFilter:o}=e;(!r||r(t))&&(yield s?t:t.fullpath());let h=new Set([t]);for(let a of h){let l=a.readdirSync();for(let f of l){(!r||r(f))&&(yield s?f:f.fullpath());let c=f;if(f.isSymbolicLink()){if(!(i&&(c=f.realpathSync())))continue;c.isUnknown()&&c.lstatSync()}c.shouldWalk(h,o)&&h.add(c)}}}stream(t=this.cwd,e={}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0,follow:i=!1,filter:r,walkFilter:o}=e,h=new as.Minipass({objectMode:!0});(!r||r(t))&&h.write(s?t:t.fullpath());let a=new Set,l=[t],f=0,c=()=>{let u=!1;for(;!u;){let p=l.shift();if(!p){f===0&&h.end();return}f++,a.add(p);let w=(b,m,y=!1)=>{if(b)return h.emit("error",b);if(i&&!y){let E=[];for(let S of m)S.isSymbolicLink()&&E.push(S.realpath().then(v=>v?.isUnknown()?v.lstat():v));if(E.length){Promise.all(E).then(()=>w(null,m,!0));return}}for(let E of m)E&&(!r||r(E))&&(h.write(s?E:E.fullpath())||(u=!0));f--;for(let E of m){let S=E.realpathCached()||E;S.shouldWalk(a,o)&&l.push(S)}u&&!h.flowing?h.once("drain",c):d||c()},d=!0;p.readdirCB(w,!0),d=!1}};return c(),h}streamSync(t=this.cwd,e={}){typeof t=="string"?t=this.cwd.resolve(t):t instanceof C||(e=t,t=this.cwd);let{withFileTypes:s=!0,follow:i=!1,filter:r,walkFilter:o}=e,h=new as.Minipass({objectMode:!0}),a=new Set;(!r||r(t))&&h.write(s?t:t.fullpath());let l=[t],f=0,c=()=>{let u=!1;for(;!u;){let p=l.shift();if(!p){f===0&&h.end();return}f++,a.add(p);let w=p.readdirSync();for(let d of w)(!r||r(d))&&(h.write(s?d:d.fullpath())||(u=!0));f--;for(let d of w){let b=d;if(d.isSymbolicLink()){if(!(i&&(b=d.realpathSync())))continue;b.isUnknown()&&b.lstatSync()}b.shouldWalk(a,o)&&l.push(b)}}u&&!h.flowing&&h.once("drain",c)};return c(),h}chdir(t=this.cwd){let e=this.cwd;this.cwd=typeof t=="string"?this.cwd.resolve(t):t,this.cwd[Ss](e)}};_.PathScurryBase=_t;var Tt=class extends _t{sep="\\";constructor(t=process.cwd(),e={}){let{nocase:s=!0}=e;super(t,Xt.win32,"\\",{...e,nocase:s}),this.nocase=s;for(let i=this.cwd;i;i=i.parent)i.nocase=this.nocase}parseRootPath(t){return Xt.win32.parse(t).root.toUpperCase()}newRoot(t){return new vt(this.rootPath,$,void 0,this.roots,this.nocase,this.childrenCache(),{fs:t})}isAbsolute(t){return t.startsWith("/")||t.startsWith("\\")||/^[a-z]:(\/|\\)/i.test(t)}};_.PathScurryWin32=Tt;var Rt=class extends _t{sep="/";constructor(t=process.cwd(),e={}){let{nocase:s=!1}=e;super(t,Xt.posix,"/",{...e,nocase:s}),this.nocase=s}parseRootPath(t){return"/"}newRoot(t){return new Et(this.rootPath,$,void 0,this.roots,this.nocase,this.childrenCache(),{fs:t})}isAbsolute(t){return t.startsWith("/")}};_.PathScurryPosix=Rt;var Jt=class extends Rt{constructor(t=process.cwd(),e={}){let{nocase:s=!0}=e;super(t,{...e,nocase:s})}};_.PathScurryDarwin=Jt;_.Path=process.platform==="win32"?vt:Et;_.PathScurry=process.platform==="win32"?Tt:process.platform==="darwin"?Jt:Rt});var Te=k(Qt=>{"use strict";Object.defineProperty(Qt,"__esModule",{value:!0});Qt.Pattern=void 0;var vr=at(),Er=n=>n.length>=1,_r=n=>n.length>=1,Tr=Symbol.for("nodejs.util.inspect.custom"),_e=class n{#t;#s;#r;length;#e;#o;#_;#b;#f;#h;#u=!0;constructor(t,e,s,i){if(!Er(t))throw new TypeError("empty pattern list");if(!_r(e))throw new TypeError("empty glob list");if(e.length!==t.length)throw new TypeError("mismatched pattern list and glob list lengths");if(this.length=t.length,s<0||s>=this.length)throw new TypeError("index out of range");if(this.#t=t,this.#s=e,this.#r=s,this.#e=i,this.#r===0){if(this.isUNC()){let[r,o,h,a,...l]=this.#t,[f,c,u,p,...w]=this.#s;l[0]===""&&(l.shift(),w.shift());let d=[r,o,h,a,""].join("/"),b=[f,c,u,p,""].join("/");this.#t=[d,...l],this.#s=[b,...w],this.length=this.#t.length}else if(this.isDrive()||this.isAbsolute()){let[r,...o]=this.#t,[h,...a]=this.#s;o[0]===""&&(o.shift(),a.shift());let l=`${r}/`,f=`${h}/`;this.#t=[l,...o],this.#s=[f,...a],this.length=this.#t.length}}}[Tr](){return`Pattern <${this.#s.slice(this.#r).join("/")}>`}pattern(){return this.#t[this.#r]}isString(){return typeof this.#t[this.#r]=="string"}isGlobstar(){return this.#t[this.#r]===vr.GLOBSTAR}isRegExp(){return this.#t[this.#r]instanceof RegExp}globString(){return this.#_=this.#_||(this.#r===0?this.isAbsolute()?this.#s[0]+this.#s.slice(1).join("/"):this.#s.join("/"):this.#s.slice(this.#r).join("/"))}hasMore(){return this.length>this.#r+1}rest(){return this.#o!==void 0?this.#o:this.hasMore()?(this.#o=new n(this.#t,this.#s,this.#r+1,this.#e),this.#o.#h=this.#h,this.#o.#f=this.#f,this.#o.#b=this.#b,this.#o):this.#o=null}isUNC(){let t=this.#t;return this.#f!==void 0?this.#f:this.#f=this.#e==="win32"&&this.#r===0&&t[0]===""&&t[1]===""&&typeof t[2]=="string"&&!!t[2]&&typeof t[3]=="string"&&!!t[3]}isDrive(){let t=this.#t;return this.#b!==void 0?this.#b:this.#b=this.#e==="win32"&&this.#r===0&&this.length>1&&typeof t[0]=="string"&&/^[a-z]:$/i.test(t[0])}isAbsolute(){let t=this.#t;return this.#h!==void 0?this.#h:this.#h=t[0]===""&&t.length>1||this.isDrive()||this.isUNC()}root(){let t=this.#t[0];return typeof t=="string"&&this.isAbsolute()&&this.#r===0?t:""}checkFollowGlobstar(){return!(this.#r===0||!this.isGlobstar()||!this.#u)}markFollowGlobstar(){return this.#r===0||!this.isGlobstar()||!this.#u?!1:(this.#u=!1,!0)}};Qt.Pattern=_e});var _s=k(te=>{"use strict";Object.defineProperty(te,"__esModule",{value:!0});te.Ignore=void 0;var Es=at(),Rr=Te(),xr=typeof process=="object"&&process&&typeof process.platform=="string"?process.platform:"linux",Re=class{relative;relativeChildren;absolute;absoluteChildren;platform;mmopts;constructor(t,{nobrace:e,nocase:s,noext:i,noglobstar:r,platform:o=xr}){this.relative=[],this.absolute=[],this.relativeChildren=[],this.absoluteChildren=[],this.platform=o,this.mmopts={dot:!0,nobrace:e,nocase:s,noext:i,noglobstar:r,optimizationLevel:2,platform:o,nocomment:!0,nonegate:!0};for(let h of t)this.add(h)}add(t){let e=new Es.Minimatch(t,this.mmopts);for(let s=0;s<e.set.length;s++){let i=e.set[s],r=e.globParts[s];if(!i||!r)throw new Error("invalid pattern object");for(;i[0]==="."&&r[0]===".";)i.shift(),r.shift();let o=new Rr.Pattern(i,r,0,this.platform),h=new Es.Minimatch(o.globString(),this.mmopts),a=r[r.length-1]==="**",l=o.isAbsolute();l?this.absolute.push(h):this.relative.push(h),a&&(l?this.absoluteChildren.push(h):this.relativeChildren.push(h))}}ignored(t){let e=t.fullpath(),s=`${e}/`,i=t.relative()||".",r=`${i}/`;for(let o of this.relative)if(o.match(i)||o.match(r))return!0;for(let o of this.absolute)if(o.match(e)||o.match(s))return!0;return!1}childrenIgnored(t){let e=`${t.fullpath()}/`,s=`${t.relative()||"."}/`;for(let i of this.relativeChildren)if(i.match(s))return!0;for(let i of this.absoluteChildren)if(i.match(e))return!0;return!1}};te.Ignore=Re});var Rs=k(U=>{"use strict";Object.defineProperty(U,"__esModule",{value:!0});U.Processor=U.SubWalks=U.MatchRecord=U.HasWalkedCache=void 0;var Ts=at(),ee=class n{store;constructor(t=new Map){this.store=t}copy(){return new n(new Map(this.store))}hasWalked(t,e){return this.store.get(t.fullpath())?.has(e.globString())}storeWalked(t,e){let s=t.fullpath(),i=this.store.get(s);i?i.add(e.globString()):this.store.set(s,new Set([e.globString()]))}};U.HasWalkedCache=ee;var se=class{store=new Map;add(t,e,s){let i=(e?2:0)|(s?1:0),r=this.store.get(t);this.store.set(t,r===void 0?i:i&r)}entries(){return[...this.store.entries()].map(([t,e])=>[t,!!(e&2),!!(e&1)])}};U.MatchRecord=se;var ie=class{store=new Map;add(t,e){if(!t.canReaddir())return;let s=this.store.get(t);s?s.find(i=>i.globString()===e.globString())||s.push(e):this.store.set(t,[e])}get(t){let e=this.store.get(t);if(!e)throw new Error("attempting to walk unknown path");return e}entries(){return this.keys().map(t=>[t,this.store.get(t)])}keys(){return[...this.store.keys()].filter(t=>t.canReaddir())}};U.SubWalks=ie;var xe=class n{hasWalkedCache;matches=new se;subwalks=new ie;patterns;follow;dot;opts;constructor(t,e){this.opts=t,this.follow=!!t.follow,this.dot=!!t.dot,this.hasWalkedCache=e?e.copy():new ee}processPatterns(t,e){this.patterns=e;let s=e.map(i=>[t,i]);for(let[i,r]of s){this.hasWalkedCache.storeWalked(i,r);let o=r.root(),h=r.isAbsolute()&&this.opts.absolute!==!1;if(o){i=i.resolve(o==="/"&&this.opts.root!==void 0?this.opts.root:o);let c=r.rest();if(c)r=c;else{this.matches.add(i,!0,!1);continue}}if(i.isENOENT())continue;let a,l,f=!1;for(;typeof(a=r.pattern())=="string"&&(l=r.rest());)i=i.resolve(a),r=l,f=!0;if(a=r.pattern(),l=r.rest(),f){if(this.hasWalkedCache.hasWalked(i,r))continue;this.hasWalkedCache.storeWalked(i,r)}if(typeof a=="string"){let c=a===".."||a===""||a===".";this.matches.add(i.resolve(a),h,c);continue}else if(a===Ts.GLOBSTAR){(!i.isSymbolicLink()||this.follow||r.checkFollowGlobstar())&&this.subwalks.add(i,r);let c=l?.pattern(),u=l?.rest();if(!l||(c===""||c===".")&&!u)this.matches.add(i,h,c===""||c===".");else if(c===".."){let p=i.parent||i;u?this.hasWalkedCache.hasWalked(p,u)||this.subwalks.add(p,u):this.matches.add(p,h,!0)}}else a instanceof RegExp&&this.subwalks.add(i,r)}return this}subwalkTargets(){return this.subwalks.keys()}child(){return new n(this.opts,this.hasWalkedCache)}filterEntries(t,e){let s=this.subwalks.get(t),i=this.child();for(let r of e)for(let o of s){let h=o.isAbsolute(),a=o.pattern(),l=o.rest();a===Ts.GLOBSTAR?i.testGlobstar(r,o,l,h):a instanceof RegExp?i.testRegExp(r,a,l,h):i.testString(r,a,l,h)}return i}testGlobstar(t,e,s,i){if((this.dot||!t.name.startsWith("."))&&(e.hasMore()||this.matches.add(t,i,!1),t.canReaddir()&&(this.follow||!t.isSymbolicLink()?this.subwalks.add(t,e):t.isSymbolicLink()&&(s&&e.checkFollowGlobstar()?this.subwalks.add(t,s):e.markFollowGlobstar()&&this.subwalks.add(t,e)))),s){let r=s.pattern();if(typeof r=="string"&&r!==".."&&r!==""&&r!==".")this.testString(t,r,s.rest(),i);else if(r===".."){let o=t.parent||t;this.subwalks.add(o,s)}else r instanceof RegExp&&this.testRegExp(t,r,s.rest(),i)}}testRegExp(t,e,s,i){e.test(t.name)&&(s?this.subwalks.add(t,s):this.matches.add(t,i,!1))}testString(t,e,s,i){t.isNamed(e)&&(s?this.subwalks.add(t,s):this.matches.add(t,i,!1))}};U.Processor=xe});var As=k(nt=>{"use strict";Object.defineProperty(nt,"__esModule",{value:!0});nt.GlobWalker=nt.GlobUtil=void 0;var xs=_s(),Os=Rs(),Or=(n,t)=>typeof n=="string"?new xs.Ignore([n],t):Array.isArray(n)?new xs.Ignore(n,t):n,re=class{path;patterns;opts;seen=new Set;paused=!1;aborted=!1;#t=[];#s;#r;signal;maxDepth;includeChildMatches;constructor(t,e,s){if(this.patterns=t,this.path=e,this.opts=s,this.#r=!s.posix&&s.platform==="win32"?"\\":"/",this.includeChildMatches=s.includeChildMatches!==!1,(s.ignore||!this.includeChildMatches)&&(this.#s=Or(s.ignore??[],s),!this.includeChildMatches&&typeof this.#s.add!="function")){let i="cannot ignore child matches, ignore lacks add() method.";throw new Error(i)}this.maxDepth=s.maxDepth||1/0,s.signal&&(this.signal=s.signal,this.signal.addEventListener("abort",()=>{this.#t.length=0}))}#e(t){return this.seen.has(t)||!!this.#s?.ignored?.(t)}#o(t){return!!this.#s?.childrenIgnored?.(t)}pause(){this.paused=!0}resume(){if(this.signal?.aborted)return;this.paused=!1;let t;for(;!this.paused&&(t=this.#t.shift());)t()}onResume(t){this.signal?.aborted||(this.paused?this.#t.push(t):t())}async matchCheck(t,e){if(e&&this.opts.nodir)return;let s,i;if(this.opts.realpath){if(s=t.realpathCached()||await t.realpath(),!s)return;i=s}else i=t;let o=i.isUnknown()||this.opts.stat?await i.lstat():i;if(this.opts.follow&&this.opts.nodir&&o?.isSymbolicLink()){let h=await o.realpath();h&&(h.isUnknown()||this.opts.stat)&&await h.lstat()}return this.matchCheckTest(o,e)}matchCheckTest(t,e){return t&&(this.maxDepth===1/0||t.depth()<=this.maxDepth)&&(!e||t.canReaddir())&&(!this.opts.nodir||!t.isDirectory())&&(!this.opts.nodir||!this.opts.follow||!t.isSymbolicLink()||!t.realpathCached()?.isDirectory())&&!this.#e(t)?t:void 0}matchCheckSync(t,e){if(e&&this.opts.nodir)return;let s,i;if(this.opts.realpath){if(s=t.realpathCached()||t.realpathSync(),!s)return;i=s}else i=t;let o=i.isUnknown()||this.opts.stat?i.lstatSync():i;if(this.opts.follow&&this.opts.nodir&&o?.isSymbolicLink()){let h=o.realpathSync();h&&(h?.isUnknown()||this.opts.stat)&&h.lstatSync()}return this.matchCheckTest(o,e)}matchFinish(t,e){if(this.#e(t))return;if(!this.includeChildMatches&&this.#s?.add){let r=`${t.relativePosix()}/**`;this.#s.add(r)}let s=this.opts.absolute===void 0?e:this.opts.absolute;this.seen.add(t);let i=this.opts.mark&&t.isDirectory()?this.#r:"";if(this.opts.withFileTypes)this.matchEmit(t);else if(s){let r=this.opts.posix?t.fullpathPosix():t.fullpath();this.matchEmit(r+i)}else{let r=this.opts.posix?t.relativePosix():t.relative(),o=this.opts.dotRelative&&!r.startsWith(`..${this.#r}`)?`.${this.#r}`:"";this.matchEmit(r?o+r+i:`.${i}`)}}async match(t,e,s){let i=await this.matchCheck(t,s);i&&this.matchFinish(i,e)}matchSync(t,e,s){let i=this.matchCheckSync(t,s);i&&this.matchFinish(i,e)}walkCB(t,e,s){this.signal?.aborted&&s(),this.walkCB2(t,e,new Os.Processor(this.opts),s)}walkCB2(t,e,s,i){if(this.#o(t))return i();if(this.signal?.aborted&&i(),this.paused){this.onResume(()=>this.walkCB2(t,e,s,i));return}s.processPatterns(t,e);let r=1,o=()=>{--r===0&&i()};for(let[h,a,l]of s.matches.entries())this.#e(h)||(r++,this.match(h,a,l).then(()=>o()));for(let h of s.subwalkTargets()){if(this.maxDepth!==1/0&&h.depth()>=this.maxDepth)continue;r++;let a=h.readdirCached();h.calledReaddir()?this.walkCB3(h,a,s,o):h.readdirCB((l,f)=>this.walkCB3(h,f,s,o),!0)}o()}walkCB3(t,e,s,i){let r=s.filterEntries(t,e),o=1,h=()=>{--o===0&&i()};for(let[a,l,f]of r.matches.entries())this.#e(a)||(o++,this.match(a,l,f).then(()=>h()));for(let[a,l]of r.subwalks.entries())o++,this.walkCB2(a,l,r.child(),h);h()}walkCBSync(t,e,s){this.signal?.aborted&&s(),this.walkCB2Sync(t,e,new Os.Processor(this.opts),s)}walkCB2Sync(t,e,s,i){if(this.#o(t))return i();if(this.signal?.aborted&&i(),this.paused){this.onResume(()=>this.walkCB2Sync(t,e,s,i));return}s.processPatterns(t,e);let r=1,o=()=>{--r===0&&i()};for(let[h,a,l]of s.matches.entries())this.#e(h)||this.matchSync(h,a,l);for(let h of s.subwalkTargets()){if(this.maxDepth!==1/0&&h.depth()>=this.maxDepth)continue;r++;let a=h.readdirSync();this.walkCB3Sync(h,a,s,o)}o()}walkCB3Sync(t,e,s,i){let r=s.filterEntries(t,e),o=1,h=()=>{--o===0&&i()};for(let[a,l,f]of r.matches.entries())this.#e(a)||this.matchSync(a,l,f);for(let[a,l]of r.subwalks.entries())o++,this.walkCB2Sync(a,l,r.child(),h);h()}};nt.GlobUtil=re;var Oe=class extends re{matches=new Set;constructor(t,e,s){super(t,e,s)}matchEmit(t){this.matches.add(t)}async walk(){if(this.signal?.aborted)throw this.signal.reason;return this.path.isUnknown()&&await this.path.lstat(),await new Promise((t,e)=>{this.walkCB(this.path,this.patterns,()=>{this.signal?.aborted?e(this.signal.reason):t(this.matches)})}),this.matches}};nt.GlobWalker=Oe});var Cs=k(oe=>{"use strict";Object.defineProperty(oe,"__esModule",{value:!0});oe.Glob=void 0;var Ar=at(),Cr=__nccwpck_require__(3136),ne=vs(),kr=Te(),Mr=As(),Pr=typeof process=="object"&&process&&typeof process.platform=="string"?process.platform:"linux",Ae=class{absolute;cwd;root;dot;dotRelative;follow;ignore;magicalBraces;mark;matchBase;maxDepth;nobrace;nocase;nodir;noext;noglobstar;pattern;platform;realpath;scurry;stat;signal;windowsPathsNoEscape;withFileTypes;includeChildMatches;opts;patterns;constructor(t,e){if(!e)throw new TypeError("glob options required");if(this.withFileTypes=!!e.withFileTypes,this.signal=e.signal,this.follow=!!e.follow,this.dot=!!e.dot,this.dotRelative=!!e.dotRelative,this.nodir=!!e.nodir,this.mark=!!e.mark,e.cwd?(e.cwd instanceof URL||e.cwd.startsWith("file://"))&&(e.cwd=(0,Cr.fileURLToPath)(e.cwd)):this.cwd="",this.cwd=e.cwd||"",this.root=e.root,this.magicalBraces=!!e.magicalBraces,this.nobrace=!!e.nobrace,this.noext=!!e.noext,this.realpath=!!e.realpath,this.absolute=e.absolute,this.includeChildMatches=e.includeChildMatches!==!1,this.noglobstar=!!e.noglobstar,this.matchBase=!!e.matchBase,this.maxDepth=typeof e.maxDepth=="number"?e.maxDepth:1/0,this.stat=!!e.stat,this.ignore=e.ignore,this.withFileTypes&&this.absolute!==void 0)throw new Error("cannot set absolute and withFileTypes:true");let s=typeof t=="string"?[t]:t;if(this.windowsPathsNoEscape=!!e.windowsPathsNoEscape||e.allowWindowsEscape===!1,this.windowsPathsNoEscape&&(s=s.map(l=>l.replace(/\\/g,"/"))),this.matchBase){if(e.noglobstar)throw new TypeError("base matching requires globstar");s=s.map(l=>l.includes("/")?l:`./**/${l}`)}if(this.pattern=s,this.platform=e.platform||Pr,this.opts={...e,platform:this.platform},e.scurry){if(this.scurry=e.scurry,e.nocase!==void 0&&e.nocase!==e.scurry.nocase)throw new Error("nocase option contradicts provided scurry option")}else{let l=e.platform==="win32"?ne.PathScurryWin32:e.platform==="darwin"?ne.PathScurryDarwin:e.platform?ne.PathScurryPosix:ne.PathScurry;this.scurry=new l(this.cwd,{nocase:e.nocase,fs:e.fs})}this.nocase=this.scurry.nocase;let i=this.platform==="darwin"||this.platform==="win32",r={braceExpandMax:1e4,...e,dot:this.dot,matchBase:this.matchBase,nobrace:this.nobrace,nocase:this.nocase,nocaseMagicOnly:i,nocomment:!0,noext:this.noext,nonegate:!0,optimizationLevel:2,platform:this.platform,windowsPathsNoEscape:this.windowsPathsNoEscape,debug:!!this.opts.debug},o=this.pattern.map(l=>new Ar.Minimatch(l,r)),[h,a]=o.reduce((l,f)=>(l[0].push(...f.set),l[1].push(...f.globParts),l),[[],[]]);this.patterns=h.map((l,f)=>{let c=a[f];if(!c)throw new Error("invalid pattern object");return new kr.Pattern(l,c,0,this.platform)})}async walk(){return[...await new Mr.GlobWalker(this.patterns,this.scurry.cwd,{...this.opts,maxDepth:this.maxDepth!==1/0?this.maxDepth+this.scurry.cwd.depth():1/0,platform:this.platform,nocase:this.nocase,includeChildMatches:this.includeChildMatches}).walk()]}};oe.Glob=Ae});Object.defineProperty(exports, "__esModule", ({value:!0}));exports.glob=Dr;var Fr=Cs();async function Dr(n,t={}){return new Fr.Glob(n,t).walk()}
//# sourceMappingURL=index.min.js.map


/***/ }),

/***/ 3556:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.assertValidPattern = void 0;
const MAX_PATTERN_LENGTH = 1024 * 64;
const assertValidPattern = (pattern) => {
    if (typeof pattern !== 'string') {
        throw new TypeError('invalid pattern');
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new TypeError('pattern is too long');
    }
};
exports.assertValidPattern = assertValidPattern;
//# sourceMappingURL=assert-valid-pattern.js.map

/***/ }),

/***/ 3196:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


// parse a single path portion
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AST = void 0;
const brace_expressions_js_1 = __nccwpck_require__(3741);
const unescape_js_1 = __nccwpck_require__(3098);
const types = new Set(['!', '?', '+', '*', '@']);
const isExtglobType = (c) => types.has(c);
const isExtglobAST = (c) => isExtglobType(c.type);
// Map of which extglob types can adopt the children of a nested extglob
//
// anything but ! can adopt a matching type:
// +(a|+(b|c)|d) => +(a|b|c|d)
// *(a|*(b|c)|d) => *(a|b|c|d)
// @(a|@(b|c)|d) => @(a|b|c|d)
// ?(a|?(b|c)|d) => ?(a|b|c|d)
//
// * can adopt anything, because 0 or repetition is allowed
// *(a|?(b|c)|d) => *(a|b|c|d)
// *(a|+(b|c)|d) => *(a|b|c|d)
// *(a|@(b|c)|d) => *(a|b|c|d)
//
// + can adopt @, because 1 or repetition is allowed
// +(a|@(b|c)|d) => +(a|b|c|d)
//
// + and @ CANNOT adopt *, because 0 would be allowed
// +(a|*(b|c)|d) => would match "", on *(b|c)
// @(a|*(b|c)|d) => would match "", on *(b|c)
//
// + and @ CANNOT adopt ?, because 0 would be allowed
// +(a|?(b|c)|d) => would match "", on ?(b|c)
// @(a|?(b|c)|d) => would match "", on ?(b|c)
//
// ? can adopt @, because 0 or 1 is allowed
// ?(a|@(b|c)|d) => ?(a|b|c|d)
//
// ? and @ CANNOT adopt * or +, because >1 would be allowed
// ?(a|*(b|c)|d) => would match bbb on *(b|c)
// @(a|*(b|c)|d) => would match bbb on *(b|c)
// ?(a|+(b|c)|d) => would match bbb on +(b|c)
// @(a|+(b|c)|d) => would match bbb on +(b|c)
//
// ! CANNOT adopt ! (nothing else can either)
// !(a|!(b|c)|d) => !(a|b|c|d) would fail to match on b (not not b|c)
//
// ! can adopt @
// !(a|@(b|c)|d) => !(a|b|c|d)
//
// ! CANNOT adopt *
// !(a|*(b|c)|d) => !(a|b|c|d) would match on bbb, not allowed
//
// ! CANNOT adopt +
// !(a|+(b|c)|d) => !(a|b|c|d) would match on bbb, not allowed
//
// ! CANNOT adopt ?
// x!(a|?(b|c)|d) => x!(a|b|c|d) would fail to match "x"
const adoptionMap = new Map([
    ['!', ['@']],
    ['?', ['?', '@']],
    ['@', ['@']],
    ['*', ['*', '+', '?', '@']],
    ['+', ['+', '@']],
]);
// nested extglobs that can be adopted in, but with the addition of
// a blank '' element.
const adoptionWithSpaceMap = new Map([
    ['!', ['?']],
    ['@', ['?']],
    ['+', ['?', '*']],
]);
// union of the previous two maps
const adoptionAnyMap = new Map([
    ['!', ['?', '@']],
    ['?', ['?', '@']],
    ['@', ['?', '@']],
    ['*', ['*', '+', '?', '@']],
    ['+', ['+', '@', '?', '*']],
]);
// Extglobs that can take over their parent if they are the only child
// the key is parent, value maps child to resulting extglob parent type
// '@' is omitted because it's a special case. An `@` extglob with a single
// member can always be usurped by that subpattern.
const usurpMap = new Map([
    ['!', new Map([['!', '@']])],
    [
        '?',
        new Map([
            ['*', '*'],
            ['+', '*'],
        ]),
    ],
    [
        '@',
        new Map([
            ['!', '!'],
            ['?', '?'],
            ['@', '@'],
            ['*', '*'],
            ['+', '+'],
        ]),
    ],
    [
        '+',
        new Map([
            ['?', '*'],
            ['*', '*'],
        ]),
    ],
]);
// Patterns that get prepended to bind to the start of either the
// entire string, or just a single path portion, to prevent dots
// and/or traversal patterns, when needed.
// Exts don't need the ^ or / bit, because the root binds that already.
const startNoTraversal = '(?!(?:^|/)\\.\\.?(?:$|/))';
const startNoDot = '(?!\\.)';
// characters that indicate a start of pattern needs the "no dots" bit,
// because a dot *might* be matched. ( is not in the list, because in
// the case of a child extglob, it will handle the prevention itself.
const addPatternStart = new Set(['[', '.']);
// cases where traversal is A-OK, no dot prevention needed
const justDots = new Set(['..', '.']);
const reSpecials = new Set('().*{}+?[]^$\\!');
const regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
// any single thing other than /
const qmark = '[^/]';
// * => any number of characters
const star = qmark + '*?';
// use + when we need to ensure that *something* matches, because the * is
// the only thing in the path portion.
const starNoEmpty = qmark + '+?';
// remove the \ chars that we added if we end up doing a nonmagic compare
// const deslash = (s: string) => s.replace(/\\(.)/g, '$1')
let ID = 0;
class AST {
    type;
    #root;
    #hasMagic;
    #uflag = false;
    #parts = [];
    #parent;
    #parentIndex;
    #negs;
    #filledNegs = false;
    #options;
    #toString;
    // set to true if it's an extglob with no children
    // (which really means one child of '')
    #emptyExt = false;
    id = ++ID;
    get depth() {
        return (this.#parent?.depth ?? -1) + 1;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return {
            '@@type': 'AST',
            id: this.id,
            type: this.type,
            root: this.#root.id,
            parent: this.#parent?.id,
            depth: this.depth,
            partsLength: this.#parts.length,
            parts: this.#parts,
        };
    }
    constructor(type, parent, options = {}) {
        this.type = type;
        // extglobs are inherently magical
        if (type)
            this.#hasMagic = true;
        this.#parent = parent;
        this.#root = this.#parent ? this.#parent.#root : this;
        this.#options = this.#root === this ? options : this.#root.#options;
        this.#negs = this.#root === this ? [] : this.#root.#negs;
        if (type === '!' && !this.#root.#filledNegs)
            this.#negs.push(this);
        this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
    }
    get hasMagic() {
        /* c8 ignore start */
        if (this.#hasMagic !== undefined)
            return this.#hasMagic;
        /* c8 ignore stop */
        for (const p of this.#parts) {
            if (typeof p === 'string')
                continue;
            if (p.type || p.hasMagic)
                return (this.#hasMagic = true);
        }
        // note: will be undefined until we generate the regexp src and find out
        return this.#hasMagic;
    }
    // reconstructs the pattern
    toString() {
        return (this.#toString !== undefined ? this.#toString
            : !this.type ?
                (this.#toString = this.#parts.map(p => String(p)).join(''))
                : (this.#toString =
                    this.type +
                        '(' +
                        this.#parts.map(p => String(p)).join('|') +
                        ')'));
    }
    #fillNegs() {
        /* c8 ignore start */
        if (this !== this.#root)
            throw new Error('should only call on root');
        if (this.#filledNegs)
            return this;
        /* c8 ignore stop */
        // call toString() once to fill this out
        this.toString();
        this.#filledNegs = true;
        let n;
        while ((n = this.#negs.pop())) {
            if (n.type !== '!')
                continue;
            // walk up the tree, appending everthing that comes AFTER parentIndex
            let p = n;
            let pp = p.#parent;
            while (pp) {
                for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) {
                    for (const part of n.#parts) {
                        /* c8 ignore start */
                        if (typeof part === 'string') {
                            throw new Error('string part in extglob AST??');
                        }
                        /* c8 ignore stop */
                        part.copyIn(pp.#parts[i]);
                    }
                }
                p = pp;
                pp = p.#parent;
            }
        }
        return this;
    }
    push(...parts) {
        for (const p of parts) {
            if (p === '')
                continue;
            /* c8 ignore start */
            if (typeof p !== 'string' &&
                !(p instanceof _a && p.#parent === this)) {
                throw new Error('invalid part: ' + p);
            }
            /* c8 ignore stop */
            this.#parts.push(p);
        }
    }
    toJSON() {
        const ret = this.type === null ?
            this.#parts
                .slice()
                .map(p => (typeof p === 'string' ? p : p.toJSON()))
            : [this.type, ...this.#parts.map(p => p.toJSON())];
        if (this.isStart() && !this.type)
            ret.unshift([]);
        if (this.isEnd() &&
            (this === this.#root ||
                (this.#root.#filledNegs && this.#parent?.type === '!'))) {
            ret.push({});
        }
        return ret;
    }
    isStart() {
        if (this.#root === this)
            return true;
        // if (this.type) return !!this.#parent?.isStart()
        if (!this.#parent?.isStart())
            return false;
        if (this.#parentIndex === 0)
            return true;
        // if everything AHEAD of this is a negation, then it's still the "start"
        const p = this.#parent;
        for (let i = 0; i < this.#parentIndex; i++) {
            const pp = p.#parts[i];
            if (!(pp instanceof _a && pp.type === '!')) {
                return false;
            }
        }
        return true;
    }
    isEnd() {
        if (this.#root === this)
            return true;
        if (this.#parent?.type === '!')
            return true;
        if (!this.#parent?.isEnd())
            return false;
        if (!this.type)
            return this.#parent?.isEnd();
        // if not root, it'll always have a parent
        /* c8 ignore start */
        const pl = this.#parent ? this.#parent.#parts.length : 0;
        /* c8 ignore stop */
        return this.#parentIndex === pl - 1;
    }
    copyIn(part) {
        if (typeof part === 'string')
            this.push(part);
        else
            this.push(part.clone(this));
    }
    clone(parent) {
        const c = new _a(this.type, parent);
        for (const p of this.#parts) {
            c.copyIn(p);
        }
        return c;
    }
    static #parseAST(str, ast, pos, opt, extDepth) {
        const maxDepth = opt.maxExtglobRecursion ?? 2;
        let escaping = false;
        let inBrace = false;
        let braceStart = -1;
        let braceNeg = false;
        if (ast.type === null) {
            // outside of a extglob, append until we find a start
            let i = pos;
            let acc = '';
            while (i < str.length) {
                const c = str.charAt(i++);
                // still accumulate escapes at this point, but we do ignore
                // starts that are escaped
                if (escaping || c === '\\') {
                    escaping = !escaping;
                    acc += c;
                    continue;
                }
                if (inBrace) {
                    if (i === braceStart + 1) {
                        if (c === '^' || c === '!') {
                            braceNeg = true;
                        }
                    }
                    else if (c === ']' && !(i === braceStart + 2 && braceNeg)) {
                        inBrace = false;
                    }
                    acc += c;
                    continue;
                }
                else if (c === '[') {
                    inBrace = true;
                    braceStart = i;
                    braceNeg = false;
                    acc += c;
                    continue;
                }
                // we don't have to check for adoption here, because that's
                // done at the other recursion point.
                const doRecurse = !opt.noext &&
                    isExtglobType(c) &&
                    str.charAt(i) === '(' &&
                    extDepth <= maxDepth;
                if (doRecurse) {
                    ast.push(acc);
                    acc = '';
                    const ext = new _a(c, ast);
                    i = _a.#parseAST(str, ext, i, opt, extDepth + 1);
                    ast.push(ext);
                    continue;
                }
                acc += c;
            }
            ast.push(acc);
            return i;
        }
        // some kind of extglob, pos is at the (
        // find the next | or )
        let i = pos + 1;
        let part = new _a(null, ast);
        const parts = [];
        let acc = '';
        while (i < str.length) {
            const c = str.charAt(i++);
            // still accumulate escapes at this point, but we do ignore
            // starts that are escaped
            if (escaping || c === '\\') {
                escaping = !escaping;
                acc += c;
                continue;
            }
            if (inBrace) {
                if (i === braceStart + 1) {
                    if (c === '^' || c === '!') {
                        braceNeg = true;
                    }
                }
                else if (c === ']' && !(i === braceStart + 2 && braceNeg)) {
                    inBrace = false;
                }
                acc += c;
                continue;
            }
            else if (c === '[') {
                inBrace = true;
                braceStart = i;
                braceNeg = false;
                acc += c;
                continue;
            }
            const doRecurse = !opt.noext &&
                isExtglobType(c) &&
                str.charAt(i) === '(' &&
                /* c8 ignore start - the maxDepth is sufficient here */
                (extDepth <= maxDepth || (ast && ast.#canAdoptType(c)));
            /* c8 ignore stop */
            if (doRecurse) {
                const depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
                part.push(acc);
                acc = '';
                const ext = new _a(c, part);
                part.push(ext);
                i = _a.#parseAST(str, ext, i, opt, extDepth + depthAdd);
                continue;
            }
            if (c === '|') {
                part.push(acc);
                acc = '';
                parts.push(part);
                part = new _a(null, ast);
                continue;
            }
            if (c === ')') {
                if (acc === '' && ast.#parts.length === 0) {
                    ast.#emptyExt = true;
                }
                part.push(acc);
                acc = '';
                ast.push(...parts, part);
                return i;
            }
            acc += c;
        }
        // unfinished extglob
        // if we got here, it was a malformed extglob! not an extglob, but
        // maybe something else in there.
        ast.type = null;
        ast.#hasMagic = undefined;
        ast.#parts = [str.substring(pos - 1)];
        return i;
    }
    #canAdoptWithSpace(child) {
        return this.#canAdopt(child, adoptionWithSpaceMap);
    }
    #canAdopt(child, map = adoptionMap) {
        if (!child ||
            typeof child !== 'object' ||
            child.type !== null ||
            child.#parts.length !== 1 ||
            this.type === null) {
            return false;
        }
        const gc = child.#parts[0];
        if (!gc || typeof gc !== 'object' || gc.type === null) {
            return false;
        }
        return this.#canAdoptType(gc.type, map);
    }
    #canAdoptType(c, map = adoptionAnyMap) {
        return !!map.get(this.type)?.includes(c);
    }
    #adoptWithSpace(child, index) {
        const gc = child.#parts[0];
        const blank = new _a(null, gc, this.options);
        blank.#parts.push('');
        gc.push(blank);
        this.#adopt(child, index);
    }
    #adopt(child, index) {
        const gc = child.#parts[0];
        this.#parts.splice(index, 1, ...gc.#parts);
        for (const p of gc.#parts) {
            if (typeof p === 'object')
                p.#parent = this;
        }
        this.#toString = undefined;
    }
    #canUsurpType(c) {
        const m = usurpMap.get(this.type);
        return !!m?.has(c);
    }
    #canUsurp(child) {
        if (!child ||
            typeof child !== 'object' ||
            child.type !== null ||
            child.#parts.length !== 1 ||
            this.type === null ||
            this.#parts.length !== 1) {
            return false;
        }
        const gc = child.#parts[0];
        if (!gc || typeof gc !== 'object' || gc.type === null) {
            return false;
        }
        return this.#canUsurpType(gc.type);
    }
    #usurp(child) {
        const m = usurpMap.get(this.type);
        const gc = child.#parts[0];
        const nt = m?.get(gc.type);
        /* c8 ignore start - impossible */
        if (!nt)
            return false;
        /* c8 ignore stop */
        this.#parts = gc.#parts;
        for (const p of this.#parts) {
            if (typeof p === 'object') {
                p.#parent = this;
            }
        }
        this.type = nt;
        this.#toString = undefined;
        this.#emptyExt = false;
    }
    static fromGlob(pattern, options = {}) {
        const ast = new _a(null, undefined, options);
        _a.#parseAST(pattern, ast, 0, options, 0);
        return ast;
    }
    // returns the regular expression if there's magic, or the unescaped
    // string if not.
    toMMPattern() {
        // should only be called on root
        /* c8 ignore start */
        if (this !== this.#root)
            return this.#root.toMMPattern();
        /* c8 ignore stop */
        const glob = this.toString();
        const [re, body, hasMagic, uflag] = this.toRegExpSource();
        // if we're in nocase mode, and not nocaseMagicOnly, then we do
        // still need a regular expression if we have to case-insensitively
        // match capital/lowercase characters.
        const anyMagic = hasMagic ||
            this.#hasMagic ||
            (this.#options.nocase &&
                !this.#options.nocaseMagicOnly &&
                glob.toUpperCase() !== glob.toLowerCase());
        if (!anyMagic) {
            return body;
        }
        const flags = (this.#options.nocase ? 'i' : '') + (uflag ? 'u' : '');
        return Object.assign(new RegExp(`^${re}$`, flags), {
            _src: re,
            _glob: glob,
        });
    }
    get options() {
        return this.#options;
    }
    // returns the string match, the regexp source, whether there's magic
    // in the regexp (so a regular expression is required) and whether or
    // not the uflag is needed for the regular expression (for posix classes)
    // TODO: instead of injecting the start/end at this point, just return
    // the BODY of the regexp, along with the start/end portions suitable
    // for binding the start/end in either a joined full-path makeRe context
    // (where we bind to (^|/), or a standalone matchPart context (where
    // we bind to ^, and not /).  Otherwise slashes get duped!
    //
    // In part-matching mode, the start is:
    // - if not isStart: nothing
    // - if traversal possible, but not allowed: ^(?!\.\.?$)
    // - if dots allowed or not possible: ^
    // - if dots possible and not allowed: ^(?!\.)
    // end is:
    // - if not isEnd(): nothing
    // - else: $
    //
    // In full-path matching mode, we put the slash at the START of the
    // pattern, so start is:
    // - if first pattern: same as part-matching mode
    // - if not isStart(): nothing
    // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
    // - if dots allowed or not possible: /
    // - if dots possible and not allowed: /(?!\.)
    // end is:
    // - if last pattern, same as part-matching mode
    // - else nothing
    //
    // Always put the (?:$|/) on negated tails, though, because that has to be
    // there to bind the end of the negated pattern portion, and it's easier to
    // just stick it in now rather than try to inject it later in the middle of
    // the pattern.
    //
    // We can just always return the same end, and leave it up to the caller
    // to know whether it's going to be used joined or in parts.
    // And, if the start is adjusted slightly, can do the same there:
    // - if not isStart: nothing
    // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
    // - if dots allowed or not possible: (?:/|^)
    // - if dots possible and not allowed: (?:/|^)(?!\.)
    //
    // But it's better to have a simpler binding without a conditional, for
    // performance, so probably better to return both start options.
    //
    // Then the caller just ignores the end if it's not the first pattern,
    // and the start always gets applied.
    //
    // But that's always going to be $ if it's the ending pattern, or nothing,
    // so the caller can just attach $ at the end of the pattern when building.
    //
    // So the todo is:
    // - better detect what kind of start is needed
    // - return both flavors of starting pattern
    // - attach $ at the end of the pattern when creating the actual RegExp
    //
    // Ah, but wait, no, that all only applies to the root when the first pattern
    // is not an extglob. If the first pattern IS an extglob, then we need all
    // that dot prevention biz to live in the extglob portions, because eg
    // +(*|.x*) can match .xy but not .yx.
    //
    // So, return the two flavors if it's #root and the first child is not an
    // AST, otherwise leave it to the child AST to handle it, and there,
    // use the (?:^|/) style of start binding.
    //
    // Even simplified further:
    // - Since the start for a join is eg /(?!\.) and the start for a part
    // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
    // or start or whatever) and prepend ^ or / at the Regexp construction.
    toRegExpSource(allowDot) {
        const dot = allowDot ?? !!this.#options.dot;
        if (this.#root === this) {
            this.#flatten();
            this.#fillNegs();
        }
        if (!isExtglobAST(this)) {
            const noEmpty = this.isStart() &&
                this.isEnd() &&
                !this.#parts.some(s => typeof s !== 'string');
            const src = this.#parts
                .map(p => {
                const [re, _, hasMagic, uflag] = typeof p === 'string' ?
                    _a.#parseGlob(p, this.#hasMagic, noEmpty)
                    : p.toRegExpSource(allowDot);
                this.#hasMagic = this.#hasMagic || hasMagic;
                this.#uflag = this.#uflag || uflag;
                return re;
            })
                .join('');
            let start = '';
            if (this.isStart()) {
                if (typeof this.#parts[0] === 'string') {
                    // this is the string that will match the start of the pattern,
                    // so we need to protect against dots and such.
                    // '.' and '..' cannot match unless the pattern is that exactly,
                    // even if it starts with . or dot:true is set.
                    const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
                    if (!dotTravAllowed) {
                        const aps = addPatternStart;
                        // check if we have a possibility of matching . or ..,
                        // and prevent that.
                        const needNoTrav =
                        // dots are allowed, and the pattern starts with [ or .
                        (dot && aps.has(src.charAt(0))) ||
                            // the pattern starts with \., and then [ or .
                            (src.startsWith('\\.') && aps.has(src.charAt(2))) ||
                            // the pattern starts with \.\., and then [ or .
                            (src.startsWith('\\.\\.') && aps.has(src.charAt(4)));
                        // no need to prevent dots if it can't match a dot, or if a
                        // sub-pattern will be preventing it anyway.
                        const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
                        start =
                            needNoTrav ? startNoTraversal
                                : needNoDot ? startNoDot
                                    : '';
                    }
                }
            }
            // append the "end of path portion" pattern to negation tails
            let end = '';
            if (this.isEnd() &&
                this.#root.#filledNegs &&
                this.#parent?.type === '!') {
                end = '(?:$|\\/)';
            }
            const final = start + src + end;
            return [
                final,
                (0, unescape_js_1.unescape)(src),
                (this.#hasMagic = !!this.#hasMagic),
                this.#uflag,
            ];
        }
        // We need to calculate the body *twice* if it's a repeat pattern
        // at the start, once in nodot mode, then again in dot mode, so a
        // pattern like *(?) can match 'x.y'
        const repeated = this.type === '*' || this.type === '+';
        // some kind of extglob
        const start = this.type === '!' ? '(?:(?!(?:' : '(?:';
        let body = this.#partsToRegExp(dot);
        if (this.isStart() && this.isEnd() && !body && this.type !== '!') {
            // invalid extglob, has to at least be *something* present, if it's
            // the entire path portion.
            const s = this.toString();
            const me = this;
            me.#parts = [s];
            me.type = null;
            me.#hasMagic = undefined;
            return [s, (0, unescape_js_1.unescape)(this.toString()), false, false];
        }
        let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ?
            ''
            : this.#partsToRegExp(true);
        if (bodyDotAllowed === body) {
            bodyDotAllowed = '';
        }
        if (bodyDotAllowed) {
            body = `(?:${body})(?:${bodyDotAllowed})*?`;
        }
        // an empty !() is exactly equivalent to a starNoEmpty
        let final = '';
        if (this.type === '!' && this.#emptyExt) {
            final = (this.isStart() && !dot ? startNoDot : '') + starNoEmpty;
        }
        else {
            const close = this.type === '!' ?
                // !() must match something,but !(x) can match ''
                '))' +
                    (this.isStart() && !dot && !allowDot ? startNoDot : '') +
                    star +
                    ')'
                : this.type === '@' ? ')'
                    : this.type === '?' ? ')?'
                        : this.type === '+' && bodyDotAllowed ? ')'
                            : this.type === '*' && bodyDotAllowed ? `)?`
                                : `)${this.type}`;
            final = start + body + close;
        }
        return [
            final,
            (0, unescape_js_1.unescape)(body),
            (this.#hasMagic = !!this.#hasMagic),
            this.#uflag,
        ];
    }
    #flatten() {
        if (!isExtglobAST(this)) {
            for (const p of this.#parts) {
                if (typeof p === 'object') {
                    p.#flatten();
                }
            }
        }
        else {
            // do up to 10 passes to flatten as much as possible
            let iterations = 0;
            let done = false;
            do {
                done = true;
                for (let i = 0; i < this.#parts.length; i++) {
                    const c = this.#parts[i];
                    if (typeof c === 'object') {
                        c.#flatten();
                        if (this.#canAdopt(c)) {
                            done = false;
                            this.#adopt(c, i);
                        }
                        else if (this.#canAdoptWithSpace(c)) {
                            done = false;
                            this.#adoptWithSpace(c, i);
                        }
                        else if (this.#canUsurp(c)) {
                            done = false;
                            this.#usurp(c);
                        }
                    }
                }
            } while (!done && ++iterations < 10);
        }
        this.#toString = undefined;
    }
    #partsToRegExp(dot) {
        return this.#parts
            .map(p => {
            // extglob ASTs should only contain parent ASTs
            /* c8 ignore start */
            if (typeof p === 'string') {
                throw new Error('string type in extglob ast??');
            }
            /* c8 ignore stop */
            // can ignore hasMagic, because extglobs are already always magic
            const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
            this.#uflag = this.#uflag || uflag;
            return re;
        })
            .filter(p => !(this.isStart() && this.isEnd()) || !!p)
            .join('|');
    }
    static #parseGlob(glob, hasMagic, noEmpty = false) {
        let escaping = false;
        let re = '';
        let uflag = false;
        // multiple stars that aren't globstars coalesce into one *
        let inStar = false;
        for (let i = 0; i < glob.length; i++) {
            const c = glob.charAt(i);
            if (escaping) {
                escaping = false;
                re += (reSpecials.has(c) ? '\\' : '') + c;
                continue;
            }
            if (c === '*') {
                if (inStar)
                    continue;
                inStar = true;
                re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star;
                hasMagic = true;
                continue;
            }
            else {
                inStar = false;
            }
            if (c === '\\') {
                if (i === glob.length - 1) {
                    re += '\\\\';
                }
                else {
                    escaping = true;
                }
                continue;
            }
            if (c === '[') {
                const [src, needUflag, consumed, magic] = (0, brace_expressions_js_1.parseClass)(glob, i);
                if (consumed) {
                    re += src;
                    uflag = uflag || needUflag;
                    i += consumed - 1;
                    hasMagic = hasMagic || magic;
                    continue;
                }
            }
            if (c === '?') {
                re += qmark;
                hasMagic = true;
                continue;
            }
            re += regExpEscape(c);
        }
        return [re, (0, unescape_js_1.unescape)(glob), !!hasMagic, uflag];
    }
}
exports.AST = AST;
_a = AST;
//# sourceMappingURL=ast.js.map

/***/ }),

/***/ 3741:
/***/ ((__unused_webpack_module, exports) => {


// translate the various posix character classes into unicode properties
// this works across all unicode locales
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseClass = void 0;
// { <posix class>: [<translation>, /u flag required, negated]
const posixClasses = {
    '[:alnum:]': ['\\p{L}\\p{Nl}\\p{Nd}', true],
    '[:alpha:]': ['\\p{L}\\p{Nl}', true],
    '[:ascii:]': ['\\x' + '00-\\x' + '7f', false],
    '[:blank:]': ['\\p{Zs}\\t', true],
    '[:cntrl:]': ['\\p{Cc}', true],
    '[:digit:]': ['\\p{Nd}', true],
    '[:graph:]': ['\\p{Z}\\p{C}', true, true],
    '[:lower:]': ['\\p{Ll}', true],
    '[:print:]': ['\\p{C}', true],
    '[:punct:]': ['\\p{P}', true],
    '[:space:]': ['\\p{Z}\\t\\r\\n\\v\\f', true],
    '[:upper:]': ['\\p{Lu}', true],
    '[:word:]': ['\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}', true],
    '[:xdigit:]': ['A-Fa-f0-9', false],
};
// only need to escape a few things inside of brace expressions
// escapes: [ \ ] -
const braceEscape = (s) => s.replace(/[[\]\\-]/g, '\\$&');
// escape all regexp magic characters
const regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
// everything has already been escaped, we just have to join
const rangesToString = (ranges) => ranges.join('');
// takes a glob string at a posix brace expression, and returns
// an equivalent regular expression source, and boolean indicating
// whether the /u flag needs to be applied, and the number of chars
// consumed to parse the character class.
// This also removes out of order ranges, and returns ($.) if the
// entire class just no good.
const parseClass = (glob, position) => {
    const pos = position;
    /* c8 ignore start */
    if (glob.charAt(pos) !== '[') {
        throw new Error('not in a brace expression');
    }
    /* c8 ignore stop */
    const ranges = [];
    const negs = [];
    let i = pos + 1;
    let sawStart = false;
    let uflag = false;
    let escaping = false;
    let negate = false;
    let endPos = pos;
    let rangeStart = '';
    WHILE: while (i < glob.length) {
        const c = glob.charAt(i);
        if ((c === '!' || c === '^') && i === pos + 1) {
            negate = true;
            i++;
            continue;
        }
        if (c === ']' && sawStart && !escaping) {
            endPos = i + 1;
            break;
        }
        sawStart = true;
        if (c === '\\') {
            if (!escaping) {
                escaping = true;
                i++;
                continue;
            }
            // escaped \ char, fall through and treat like normal char
        }
        if (c === '[' && !escaping) {
            // either a posix class, a collation equivalent, or just a [
            for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
                if (glob.startsWith(cls, i)) {
                    // invalid, [a-[] is fine, but not [a-[:alpha]]
                    if (rangeStart) {
                        return ['$.', false, glob.length - pos, true];
                    }
                    i += cls.length;
                    if (neg)
                        negs.push(unip);
                    else
                        ranges.push(unip);
                    uflag = uflag || u;
                    continue WHILE;
                }
            }
        }
        // now it's just a normal character, effectively
        escaping = false;
        if (rangeStart) {
            // throw this range away if it's not valid, but others
            // can still match.
            if (c > rangeStart) {
                ranges.push(braceEscape(rangeStart) + '-' + braceEscape(c));
            }
            else if (c === rangeStart) {
                ranges.push(braceEscape(c));
            }
            rangeStart = '';
            i++;
            continue;
        }
        // now might be the start of a range.
        // can be either c-d or c-] or c<more...>] or c] at this point
        if (glob.startsWith('-]', i + 1)) {
            ranges.push(braceEscape(c + '-'));
            i += 2;
            continue;
        }
        if (glob.startsWith('-', i + 1)) {
            rangeStart = c;
            i += 2;
            continue;
        }
        // not the start of a range, just a single character
        ranges.push(braceEscape(c));
        i++;
    }
    if (endPos < i) {
        // didn't see the end of the class, not a valid class,
        // but might still be valid as a literal match.
        return ['', false, 0, false];
    }
    // if we got no ranges and no negates, then we have a range that
    // cannot possibly match anything, and that poisons the whole glob
    if (!ranges.length && !negs.length) {
        return ['$.', false, glob.length - pos, true];
    }
    // if we got one positive range, and it's a single character, then that's
    // not actually a magic pattern, it's just that one literal character.
    // we should not treat that as "magic", we should just return the literal
    // character. [_] is a perfectly valid way to escape glob magic chars.
    if (negs.length === 0 &&
        ranges.length === 1 &&
        /^\\?.$/.test(ranges[0]) &&
        !negate) {
        const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
        return [regexpEscape(r), false, endPos - pos, false];
    }
    const sranges = '[' + (negate ? '^' : '') + rangesToString(ranges) + ']';
    const snegs = '[' + (negate ? '' : '^') + rangesToString(negs) + ']';
    const comb = ranges.length && negs.length ? '(' + sranges + '|' + snegs + ')'
        : ranges.length ? sranges
            : snegs;
    return [comb, uflag, endPos - pos, true];
};
exports.parseClass = parseClass;
//# sourceMappingURL=brace-expressions.js.map

/***/ }),

/***/ 5468:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Minimatch = exports.GLOBSTAR = exports.sep = void 0;
const brace_expansion_1 = __nccwpck_require__(8968);
const assert_valid_pattern_js_1 = __nccwpck_require__(3556);
const ast_js_1 = __nccwpck_require__(3196);
// Optimized checking for the most common glob patterns.
const starDotExtRE = /^\*+([^+@!?*[(]*)$/;
const starDotExtTest = (ext) => (f) => !f.startsWith('.') && f.endsWith(ext);
const starDotExtTestDot = (ext) => (f) => f.endsWith(ext);
const starDotExtTestNocase = (ext) => {
    ext = ext.toLowerCase();
    return (f) => !f.startsWith('.') && f.toLowerCase().endsWith(ext);
};
const starDotExtTestNocaseDot = (ext) => {
    ext = ext.toLowerCase();
    return (f) => f.toLowerCase().endsWith(ext);
};
const starDotStarRE = /^\*+\.\*+$/;
const starDotStarTest = (f) => !f.startsWith('.') && f.includes('.');
const starDotStarTestDot = (f) => f !== '.' && f !== '..' && f.includes('.');
const dotStarRE = /^\.\*+$/;
const dotStarTest = (f) => f !== '.' && f !== '..' && f.startsWith('.');
const starRE = /^\*+$/;
const starTest = (f) => f.length !== 0 && !f.startsWith('.');
const starTestDot = (f) => f.length !== 0 && f !== '.' && f !== '..';
const qmarksRE = /^\?+([^+@!?*[(]*)?$/;
const qmarksTestNocase = ([$0, ext = '']) => {
    const noext = qmarksTestNoExt([$0]);
    if (!ext)
        return noext;
    ext = ext.toLowerCase();
    return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestNocaseDot = ([$0, ext = '']) => {
    const noext = qmarksTestNoExtDot([$0]);
    if (!ext)
        return noext;
    ext = ext.toLowerCase();
    return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestDot = ([$0, ext = '']) => {
    const noext = qmarksTestNoExtDot([$0]);
    return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTest = ([$0, ext = '']) => {
    const noext = qmarksTestNoExt([$0]);
    return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTestNoExt = ([$0]) => {
    const len = $0.length;
    return (f) => f.length === len && !f.startsWith('.');
};
const qmarksTestNoExtDot = ([$0]) => {
    const len = $0.length;
    return (f) => f.length === len && f !== '.' && f !== '..';
};
/* c8 ignore start */
const defaultPlatform = (typeof process === 'object' && process ?
    (typeof process.env === 'object' &&
        process.env &&
        process.env.__MINIMATCH_TESTING_PLATFORM__) ||
        process.platform
    : 'posix');
const path = {
    win32: { sep: '\\' },
    posix: { sep: '/' },
};
/* c8 ignore stop */
exports.sep = defaultPlatform === 'win32' ? path.win32.sep : path.posix.sep;
exports.GLOBSTAR = Symbol('globstar **');
// any single thing other than /
// don't need to escape / when using new RegExp()
const qmark = '[^/]';
// * => any number of characters
const star = qmark + '*?';
// ** when dots are allowed.  Anything goes, except .. and .
// not (^ or / followed by one or two dots followed by $ or /),
// followed by anything, any number of times.
const twoStarDot = '(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?';
// not a ^ or / followed by a dot,
// followed by anything, any number of times.
const twoStarNoDot = '(?:(?!(?:\\/|^)\\.).)*?';
const ext = (a, b = {}) => Object.assign({}, a, b);
// Brace expansion:
// a{b,c}d -> abd acd
// a{b,}c -> abc ac
// a{0..3}d -> a0d a1d a2d a3d
// a{b,c{d,e}f}g -> abg acdfg acefg
// a{b,c}d{e,f}g -> abdeg acdeg abdeg abdfg
//
// Invalid sets are not expanded.
// a{2..}b -> a{2..}b
// a{b}c -> a{b}c
const braceExpand = (pattern, options = {}) => {
    (0, assert_valid_pattern_js_1.assertValidPattern)(pattern);
    // Thanks to Yeting Li <https://github.com/yetingli> for
    // improving this regexp to avoid a ReDOS vulnerability.
    if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
        // shortcut. no need to expand.
        return [pattern];
    }
    return (0, brace_expansion_1.expand)(pattern, { max: options.braceExpandMax });
};
// parse a component of the expanded set.
// At this point, no pattern may contain "/" in it
// so we're going to return a 2d array, where each entry is the full
// pattern, split on '/', and then turned into a regular expression.
// A regexp is made at the end which joins each array with an
// escaped /, and another full one which joins each regexp with |.
//
// Following the lead of Bash 4.1, note that "**" only has special meaning
// when it is the *only* thing in a path portion.  Otherwise, any series
// of * is equivalent to a single *.  Globstar behavior is enabled by
// default, and can be disabled by setting options.noglobstar.
// replace stuff like \* with *
const globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
const regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
class Minimatch {
    options;
    set;
    pattern;
    windowsPathsNoEscape;
    nonegate;
    negate;
    comment;
    empty;
    preserveMultipleSlashes;
    partial;
    globSet;
    globParts;
    nocase;
    isWindows;
    platform;
    windowsNoMagicRoot;
    maxGlobstarRecursion;
    regexp;
    constructor(pattern, options = {}) {
        (0, assert_valid_pattern_js_1.assertValidPattern)(pattern);
        options = options || {};
        this.options = options;
        this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
        this.pattern = pattern;
        this.platform = options.platform || defaultPlatform;
        this.isWindows = this.platform === 'win32';
        // avoid the annoying deprecation flag lol
        const awe = ('allowWindow' + 'sEscape');
        this.windowsPathsNoEscape =
            !!options.windowsPathsNoEscape || options[awe] === false;
        if (this.windowsPathsNoEscape) {
            this.pattern = this.pattern.replace(/\\/g, '/');
        }
        this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
        this.regexp = null;
        this.negate = false;
        this.nonegate = !!options.nonegate;
        this.comment = false;
        this.empty = false;
        this.partial = !!options.partial;
        this.nocase = !!this.options.nocase;
        this.windowsNoMagicRoot =
            options.windowsNoMagicRoot !== undefined ?
                options.windowsNoMagicRoot
                : !!(this.isWindows && this.nocase);
        this.globSet = [];
        this.globParts = [];
        this.set = [];
        // make the set of regexps etc.
        this.make();
    }
    hasMagic() {
        if (this.options.magicalBraces && this.set.length > 1) {
            return true;
        }
        for (const pattern of this.set) {
            for (const part of pattern) {
                if (typeof part !== 'string')
                    return true;
            }
        }
        return false;
    }
    debug(..._) { }
    make() {
        const pattern = this.pattern;
        const options = this.options;
        // empty patterns and comments match nothing.
        if (!options.nocomment && pattern.charAt(0) === '#') {
            this.comment = true;
            return;
        }
        if (!pattern) {
            this.empty = true;
            return;
        }
        // step 1: figure out negation, etc.
        this.parseNegate();
        // step 2: expand braces
        this.globSet = [...new Set(this.braceExpand())];
        if (options.debug) {
            //oxlint-disable-next-line no-console
            this.debug = (...args) => console.error(...args);
        }
        this.debug(this.pattern, this.globSet);
        // step 3: now we have a set, so turn each one into a series of
        // path-portion matching patterns.
        // These will be regexps, except in the case of "**", which is
        // set to the GLOBSTAR object for globstar behavior,
        // and will not contain any / characters
        //
        // First, we preprocess to make the glob pattern sets a bit simpler
        // and deduped.  There are some perf-killing patterns that can cause
        // problems with a glob walk, but we can simplify them down a bit.
        const rawGlobParts = this.globSet.map(s => this.slashSplit(s));
        this.globParts = this.preprocess(rawGlobParts);
        this.debug(this.pattern, this.globParts);
        // glob --> regexps
        let set = this.globParts.map((s, _, __) => {
            if (this.isWindows && this.windowsNoMagicRoot) {
                // check if it's a drive or unc path.
                const isUNC = s[0] === '' &&
                    s[1] === '' &&
                    (s[2] === '?' || !globMagic.test(s[2])) &&
                    !globMagic.test(s[3]);
                const isDrive = /^[a-z]:/i.test(s[0]);
                if (isUNC) {
                    return [
                        ...s.slice(0, 4),
                        ...s.slice(4).map(ss => this.parse(ss)),
                    ];
                }
                else if (isDrive) {
                    return [s[0], ...s.slice(1).map(ss => this.parse(ss))];
                }
            }
            return s.map(ss => this.parse(ss));
        });
        this.debug(this.pattern, set);
        // filter out everything that didn't compile properly.
        this.set = set.filter(s => s.indexOf(false) === -1);
        // do not treat the ? in UNC paths as magic
        if (this.isWindows) {
            for (let i = 0; i < this.set.length; i++) {
                const p = this.set[i];
                if (p[0] === '' &&
                    p[1] === '' &&
                    this.globParts[i][2] === '?' &&
                    typeof p[3] === 'string' &&
                    /^[a-z]:$/i.test(p[3])) {
                    p[2] = '?';
                }
            }
        }
        this.debug(this.pattern, this.set);
    }
    // various transforms to equivalent pattern sets that are
    // faster to process in a filesystem walk.  The goal is to
    // eliminate what we can, and push all ** patterns as far
    // to the right as possible, even if it increases the number
    // of patterns that we have to process.
    preprocess(globParts) {
        // if we're not in globstar mode, then turn ** into *
        if (this.options.noglobstar) {
            for (const partset of globParts) {
                for (let j = 0; j < partset.length; j++) {
                    if (partset[j] === '**') {
                        partset[j] = '*';
                    }
                }
            }
        }
        const { optimizationLevel = 1 } = this.options;
        if (optimizationLevel >= 2) {
            // aggressive optimization for the purpose of fs walking
            globParts = this.firstPhasePreProcess(globParts);
            globParts = this.secondPhasePreProcess(globParts);
        }
        else if (optimizationLevel >= 1) {
            // just basic optimizations to remove some .. parts
            globParts = this.levelOneOptimize(globParts);
        }
        else {
            // just collapse multiple ** portions into one
            globParts = this.adjascentGlobstarOptimize(globParts);
        }
        return globParts;
    }
    // just get rid of adjascent ** portions
    adjascentGlobstarOptimize(globParts) {
        return globParts.map(parts => {
            let gs = -1;
            while (-1 !== (gs = parts.indexOf('**', gs + 1))) {
                let i = gs;
                while (parts[i + 1] === '**') {
                    i++;
                }
                if (i !== gs) {
                    parts.splice(gs, i - gs);
                }
            }
            return parts;
        });
    }
    // get rid of adjascent ** and resolve .. portions
    levelOneOptimize(globParts) {
        return globParts.map(parts => {
            parts = parts.reduce((set, part) => {
                const prev = set[set.length - 1];
                if (part === '**' && prev === '**') {
                    return set;
                }
                if (part === '..') {
                    if (prev && prev !== '..' && prev !== '.' && prev !== '**') {
                        set.pop();
                        return set;
                    }
                }
                set.push(part);
                return set;
            }, []);
            return parts.length === 0 ? [''] : parts;
        });
    }
    levelTwoFileOptimize(parts) {
        if (!Array.isArray(parts)) {
            parts = this.slashSplit(parts);
        }
        let didSomething = false;
        do {
            didSomething = false;
            // <pre>/<e>/<rest> -> <pre>/<rest>
            if (!this.preserveMultipleSlashes) {
                for (let i = 1; i < parts.length - 1; i++) {
                    const p = parts[i];
                    // don't squeeze out UNC patterns
                    if (i === 1 && p === '' && parts[0] === '')
                        continue;
                    if (p === '.' || p === '') {
                        didSomething = true;
                        parts.splice(i, 1);
                        i--;
                    }
                }
                if (parts[0] === '.' &&
                    parts.length === 2 &&
                    (parts[1] === '.' || parts[1] === '')) {
                    didSomething = true;
                    parts.pop();
                }
            }
            // <pre>/<p>/../<rest> -> <pre>/<rest>
            let dd = 0;
            while (-1 !== (dd = parts.indexOf('..', dd + 1))) {
                const p = parts[dd - 1];
                if (p &&
                    p !== '.' &&
                    p !== '..' &&
                    p !== '**' &&
                    !(this.isWindows && /^[a-z]:$/i.test(p))) {
                    didSomething = true;
                    parts.splice(dd - 1, 2);
                    dd -= 2;
                }
            }
        } while (didSomething);
        return parts.length === 0 ? [''] : parts;
    }
    // First phase: single-pattern processing
    // <pre> is 1 or more portions
    // <rest> is 1 or more portions
    // <p> is any portion other than ., .., '', or **
    // <e> is . or ''
    //
    // **/.. is *brutal* for filesystem walking performance, because
    // it effectively resets the recursive walk each time it occurs,
    // and ** cannot be reduced out by a .. pattern part like a regexp
    // or most strings (other than .., ., and '') can be.
    //
    // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
    // <pre>/<e>/<rest> -> <pre>/<rest>
    // <pre>/<p>/../<rest> -> <pre>/<rest>
    // **/**/<rest> -> **/<rest>
    //
    // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
    // this WOULD be allowed if ** did follow symlinks, or * didn't
    firstPhasePreProcess(globParts) {
        let didSomething = false;
        do {
            didSomething = false;
            // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
            for (let parts of globParts) {
                let gs = -1;
                while (-1 !== (gs = parts.indexOf('**', gs + 1))) {
                    let gss = gs;
                    while (parts[gss + 1] === '**') {
                        // <pre>/**/**/<rest> -> <pre>/**/<rest>
                        gss++;
                    }
                    // eg, if gs is 2 and gss is 4, that means we have 3 **
                    // parts, and can remove 2 of them.
                    if (gss > gs) {
                        parts.splice(gs + 1, gss - gs);
                    }
                    let next = parts[gs + 1];
                    const p = parts[gs + 2];
                    const p2 = parts[gs + 3];
                    if (next !== '..')
                        continue;
                    if (!p ||
                        p === '.' ||
                        p === '..' ||
                        !p2 ||
                        p2 === '.' ||
                        p2 === '..') {
                        continue;
                    }
                    didSomething = true;
                    // edit parts in place, and push the new one
                    parts.splice(gs, 1);
                    const other = parts.slice(0);
                    other[gs] = '**';
                    globParts.push(other);
                    gs--;
                }
                // <pre>/<e>/<rest> -> <pre>/<rest>
                if (!this.preserveMultipleSlashes) {
                    for (let i = 1; i < parts.length - 1; i++) {
                        const p = parts[i];
                        // don't squeeze out UNC patterns
                        if (i === 1 && p === '' && parts[0] === '')
                            continue;
                        if (p === '.' || p === '') {
                            didSomething = true;
                            parts.splice(i, 1);
                            i--;
                        }
                    }
                    if (parts[0] === '.' &&
                        parts.length === 2 &&
                        (parts[1] === '.' || parts[1] === '')) {
                        didSomething = true;
                        parts.pop();
                    }
                }
                // <pre>/<p>/../<rest> -> <pre>/<rest>
                let dd = 0;
                while (-1 !== (dd = parts.indexOf('..', dd + 1))) {
                    const p = parts[dd - 1];
                    if (p && p !== '.' && p !== '..' && p !== '**') {
                        didSomething = true;
                        const needDot = dd === 1 && parts[dd + 1] === '**';
                        const splin = needDot ? ['.'] : [];
                        parts.splice(dd - 1, 2, ...splin);
                        if (parts.length === 0)
                            parts.push('');
                        dd -= 2;
                    }
                }
            }
        } while (didSomething);
        return globParts;
    }
    // second phase: multi-pattern dedupes
    // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
    // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
    // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
    //
    // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
    // ^-- not valid because ** doens't follow symlinks
    secondPhasePreProcess(globParts) {
        for (let i = 0; i < globParts.length - 1; i++) {
            for (let j = i + 1; j < globParts.length; j++) {
                const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
                if (matched) {
                    globParts[i] = [];
                    globParts[j] = matched;
                    break;
                }
            }
        }
        return globParts.filter(gs => gs.length);
    }
    partsMatch(a, b, emptyGSMatch = false) {
        let ai = 0;
        let bi = 0;
        let result = [];
        let which = '';
        while (ai < a.length && bi < b.length) {
            if (a[ai] === b[bi]) {
                result.push(which === 'b' ? b[bi] : a[ai]);
                ai++;
                bi++;
            }
            else if (emptyGSMatch && a[ai] === '**' && b[bi] === a[ai + 1]) {
                result.push(a[ai]);
                ai++;
            }
            else if (emptyGSMatch && b[bi] === '**' && a[ai] === b[bi + 1]) {
                result.push(b[bi]);
                bi++;
            }
            else if (a[ai] === '*' &&
                b[bi] &&
                (this.options.dot || !b[bi].startsWith('.')) &&
                b[bi] !== '**') {
                if (which === 'b')
                    return false;
                which = 'a';
                result.push(a[ai]);
                ai++;
                bi++;
            }
            else if (b[bi] === '*' &&
                a[ai] &&
                (this.options.dot || !a[ai].startsWith('.')) &&
                a[ai] !== '**') {
                if (which === 'a')
                    return false;
                which = 'b';
                result.push(b[bi]);
                ai++;
                bi++;
            }
            else {
                return false;
            }
        }
        // if we fall out of the loop, it means they two are identical
        // as long as their lengths match
        return a.length === b.length && result;
    }
    parseNegate() {
        if (this.nonegate)
            return;
        const pattern = this.pattern;
        let negate = false;
        let negateOffset = 0;
        for (let i = 0; i < pattern.length && pattern.charAt(i) === '!'; i++) {
            negate = !negate;
            negateOffset++;
        }
        if (negateOffset)
            this.pattern = pattern.slice(negateOffset);
        this.negate = negate;
    }
    // set partial to true to test if, for example,
    // "/a/b" matches the start of "/*/b/*/d"
    // Partial means, if you run out of file before you run
    // out of pattern, then that's fine, as long as all
    // the parts match.
    matchOne(file, pattern, partial = false) {
        let fileStartIndex = 0;
        let patternStartIndex = 0;
        // UNC paths like //?/X:/... can match X:/... and vice versa
        // Drive letters in absolute drive or unc paths are always compared
        // case-insensitively.
        if (this.isWindows) {
            const fileDrive = typeof file[0] === 'string' && /^[a-z]:$/i.test(file[0]);
            const fileUNC = !fileDrive &&
                file[0] === '' &&
                file[1] === '' &&
                file[2] === '?' &&
                /^[a-z]:$/i.test(file[3]);
            const patternDrive = typeof pattern[0] === 'string' && /^[a-z]:$/i.test(pattern[0]);
            const patternUNC = !patternDrive &&
                pattern[0] === '' &&
                pattern[1] === '' &&
                pattern[2] === '?' &&
                typeof pattern[3] === 'string' &&
                /^[a-z]:$/i.test(pattern[3]);
            const fdi = fileUNC ? 3
                : fileDrive ? 0
                    : undefined;
            const pdi = patternUNC ? 3
                : patternDrive ? 0
                    : undefined;
            if (typeof fdi === 'number' && typeof pdi === 'number') {
                const [fd, pd] = [
                    file[fdi],
                    pattern[pdi],
                ];
                // start matching at the drive letter index of each
                if (fd.toLowerCase() === pd.toLowerCase()) {
                    pattern[pdi] = fd;
                    patternStartIndex = pdi;
                    fileStartIndex = fdi;
                }
            }
        }
        // resolve and reduce . and .. portions in the file as well.
        // don't need to do the second phase, because it's only one string[]
        const { optimizationLevel = 1 } = this.options;
        if (optimizationLevel >= 2) {
            file = this.levelTwoFileOptimize(file);
        }
        if (pattern.includes(exports.GLOBSTAR)) {
            return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
        }
        return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
    }
    #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
        // split the pattern into head, tail, and middle of ** delimited parts
        const firstgs = pattern.indexOf(exports.GLOBSTAR, patternIndex);
        const lastgs = pattern.lastIndexOf(exports.GLOBSTAR);
        // split the pattern up into globstar-delimited sections
        // the tail has to be at the end, and the others just have
        // to be found in order from the head.
        const [head, body, tail] = partial ?
            [
                pattern.slice(patternIndex, firstgs),
                pattern.slice(firstgs + 1),
                [],
            ]
            : [
                pattern.slice(patternIndex, firstgs),
                pattern.slice(firstgs + 1, lastgs),
                pattern.slice(lastgs + 1),
            ];
        // check the head, from the current file/pattern index.
        if (head.length) {
            const fileHead = file.slice(fileIndex, fileIndex + head.length);
            if (!this.#matchOne(fileHead, head, partial, 0, 0)) {
                return false;
            }
            fileIndex += head.length;
            patternIndex += head.length;
        }
        // now we know the head matches!
        // if the last portion is not empty, it MUST match the end
        // check the tail
        let fileTailMatch = 0;
        if (tail.length) {
            // if head + tail > file, then we cannot possibly match
            if (tail.length + fileIndex > file.length)
                return false;
            // try to match the tail
            let tailStart = file.length - tail.length;
            if (this.#matchOne(file, tail, partial, tailStart, 0)) {
                fileTailMatch = tail.length;
            }
            else {
                // affordance for stuff like a/**/* matching a/b/
                // if the last file portion is '', and there's more to the pattern
                // then try without the '' bit.
                if (file[file.length - 1] !== '' ||
                    fileIndex + tail.length === file.length) {
                    return false;
                }
                tailStart--;
                if (!this.#matchOne(file, tail, partial, tailStart, 0)) {
                    return false;
                }
                fileTailMatch = tail.length + 1;
            }
        }
        // now we know the tail matches!
        // the middle is zero or more portions wrapped in **, possibly
        // containing more ** sections.
        // so a/**/b/**/c/**/d has become **/b/**/c/**
        // if it's empty, it means a/**/b, just verify we have no bad dots
        // if there's no tail, so it ends on /**, then we must have *something*
        // after the head, or it's not a matc
        if (!body.length) {
            let sawSome = !!fileTailMatch;
            for (let i = fileIndex; i < file.length - fileTailMatch; i++) {
                const f = String(file[i]);
                sawSome = true;
                if (f === '.' ||
                    f === '..' ||
                    (!this.options.dot && f.startsWith('.'))) {
                    return false;
                }
            }
            // in partial mode, we just need to get past all file parts
            return partial || sawSome;
        }
        // now we know that there's one or more body sections, which can
        // be matched anywhere from the 0 index (because the head was pruned)
        // through to the length-fileTailMatch index.
        // split the body up into sections, and note the minimum index it can
        // be found at (start with the length of all previous segments)
        // [section, before, after]
        const bodySegments = [[[], 0]];
        let currentBody = bodySegments[0];
        let nonGsParts = 0;
        const nonGsPartsSums = [0];
        for (const b of body) {
            if (b === exports.GLOBSTAR) {
                nonGsPartsSums.push(nonGsParts);
                currentBody = [[], 0];
                bodySegments.push(currentBody);
            }
            else {
                currentBody[0].push(b);
                nonGsParts++;
            }
        }
        let i = bodySegments.length - 1;
        const fileLength = file.length - fileTailMatch;
        for (const b of bodySegments) {
            b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
        }
        return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
    }
    // return false for "nope, not matching"
    // return null for "not matching, cannot keep trying"
    #matchGlobStarBodySections(file,
    // pattern section, last possible position for it
    bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
        // take the first body segment, and walk from fileIndex to its "after"
        // value at the end
        // If it doesn't match at that position, we increment, until we hit
        // that final possible position, and give up.
        // If it does match, then advance and try to rest.
        // If any of them fail we keep walking forward.
        // this is still a bit recursively painful, but it's more constrained
        // than previous implementations, because we never test something that
        // can't possibly be a valid matching condition.
        const bs = bodySegments[bodyIndex];
        if (!bs) {
            // just make sure that there's no bad dots
            for (let i = fileIndex; i < file.length; i++) {
                sawTail = true;
                const f = file[i];
                if (f === '.' ||
                    f === '..' ||
                    (!this.options.dot && f.startsWith('.'))) {
                    return false;
                }
            }
            return sawTail;
        }
        // have a non-globstar body section to test
        const [body, after] = bs;
        while (fileIndex <= after) {
            const m = this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
            // if limit exceeded, no match. intentional false negative,
            // acceptable break in correctness for security.
            if (m && globStarDepth < this.maxGlobstarRecursion) {
                // match! see if the rest match. if so, we're done!
                const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
                if (sub !== false) {
                    return sub;
                }
            }
            const f = file[fileIndex];
            if (f === '.' ||
                f === '..' ||
                (!this.options.dot && f.startsWith('.'))) {
                return false;
            }
            fileIndex++;
        }
        // walked off. no point continuing
        return partial || null;
    }
    #matchOne(file, pattern, partial, fileIndex, patternIndex) {
        let fi;
        let pi;
        let pl;
        let fl;
        for (fi = fileIndex,
            pi = patternIndex,
            fl = file.length,
            pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
            this.debug('matchOne loop');
            let p = pattern[pi];
            let f = file[fi];
            this.debug(pattern, p, f);
            // should be impossible.
            // some invalid regexp stuff in the set.
            /* c8 ignore start */
            if (p === false || p === exports.GLOBSTAR) {
                return false;
            }
            /* c8 ignore stop */
            // something other than **
            // non-magic patterns just have to match exactly
            // patterns with magic have been turned into regexps.
            let hit;
            if (typeof p === 'string') {
                hit = f === p;
                this.debug('string match', p, f, hit);
            }
            else {
                hit = p.test(f);
                this.debug('pattern match', p, f, hit);
            }
            if (!hit)
                return false;
        }
        // Note: ending in / means that we'll get a final ""
        // at the end of the pattern.  This can only match a
        // corresponding "" at the end of the file.
        // If the file ends in /, then it can only match a
        // a pattern that ends in /, unless the pattern just
        // doesn't have any more for it. But, a/b/ should *not*
        // match "a/b/*", even though "" matches against the
        // [^/]*? pattern, except in partial mode, where it might
        // simply not be reached yet.
        // However, a/b/ should still satisfy a/*
        // now either we fell off the end of the pattern, or we're done.
        if (fi === fl && pi === pl) {
            // ran out of pattern and filename at the same time.
            // an exact hit!
            return true;
        }
        else if (fi === fl) {
            // ran out of file, but still had pattern left.
            // this is ok if we're doing the match as part of
            // a glob fs traversal.
            return partial;
        }
        else if (pi === pl) {
            // ran out of pattern, still have file left.
            // this is only acceptable if we're on the very last
            // empty segment of a file with a trailing slash.
            // a/* should match a/b/
            return fi === fl - 1 && file[fi] === '';
            /* c8 ignore start */
        }
        else {
            // should be unreachable.
            throw new Error('wtf?');
        }
        /* c8 ignore stop */
    }
    braceExpand() {
        return braceExpand(this.pattern, this.options);
    }
    parse(pattern) {
        (0, assert_valid_pattern_js_1.assertValidPattern)(pattern);
        const options = this.options;
        // shortcuts
        if (pattern === '**')
            return exports.GLOBSTAR;
        if (pattern === '')
            return '';
        // far and away, the most common glob pattern parts are
        // *, *.*, and *.<ext>  Add a fast check method for those.
        let m;
        let fastTest = null;
        if ((m = pattern.match(starRE))) {
            fastTest = options.dot ? starTestDot : starTest;
        }
        else if ((m = pattern.match(starDotExtRE))) {
            fastTest = (options.nocase ?
                options.dot ?
                    starDotExtTestNocaseDot
                    : starDotExtTestNocase
                : options.dot ? starDotExtTestDot
                    : starDotExtTest)(m[1]);
        }
        else if ((m = pattern.match(qmarksRE))) {
            fastTest = (options.nocase ?
                options.dot ?
                    qmarksTestNocaseDot
                    : qmarksTestNocase
                : options.dot ? qmarksTestDot
                    : qmarksTest)(m);
        }
        else if ((m = pattern.match(starDotStarRE))) {
            fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
        }
        else if ((m = pattern.match(dotStarRE))) {
            fastTest = dotStarTest;
        }
        const re = ast_js_1.AST.fromGlob(pattern, this.options).toMMPattern();
        if (fastTest && typeof re === 'object') {
            // Avoids overriding in frozen environments
            Reflect.defineProperty(re, 'test', { value: fastTest });
        }
        return re;
    }
    makeRe() {
        if (this.regexp || this.regexp === false)
            return this.regexp;
        // at this point, this.set is a 2d array of partial
        // pattern strings, or "**".
        //
        // It's better to use .match().  This function shouldn't
        // be used, really, but it's pretty convenient sometimes,
        // when you just want to work with a regex.
        const set = this.set;
        if (!set.length) {
            this.regexp = false;
            return this.regexp;
        }
        const options = this.options;
        const twoStar = options.noglobstar ? star
            : options.dot ? twoStarDot
                : twoStarNoDot;
        const flags = new Set(options.nocase ? ['i'] : []);
        // regexpify non-globstar patterns
        // if ** is only item, then we just do one twoStar
        // if ** is first, and there are more, prepend (\/|twoStar\/)? to next
        // if ** is last, append (\/twoStar|) to previous
        // if ** is in the middle, append (\/|\/twoStar\/) to previous
        // then filter out GLOBSTAR symbols
        let re = set
            .map(pattern => {
            const pp = pattern.map(p => {
                if (p instanceof RegExp) {
                    for (const f of p.flags.split(''))
                        flags.add(f);
                }
                return (typeof p === 'string' ? regExpEscape(p)
                    : p === exports.GLOBSTAR ? exports.GLOBSTAR
                        : p._src);
            });
            pp.forEach((p, i) => {
                const next = pp[i + 1];
                const prev = pp[i - 1];
                if (p !== exports.GLOBSTAR || prev === exports.GLOBSTAR) {
                    return;
                }
                if (prev === undefined) {
                    if (next !== undefined && next !== exports.GLOBSTAR) {
                        pp[i + 1] = '(?:\\/|' + twoStar + '\\/)?' + next;
                    }
                    else {
                        pp[i] = twoStar;
                    }
                }
                else if (next === undefined) {
                    pp[i - 1] = prev + '(?:\\/|\\/' + twoStar + ')?';
                }
                else if (next !== exports.GLOBSTAR) {
                    pp[i - 1] = prev + '(?:\\/|\\/' + twoStar + '\\/)' + next;
                    pp[i + 1] = exports.GLOBSTAR;
                }
            });
            const filtered = pp.filter(p => p !== exports.GLOBSTAR);
            // For partial matches, we need to make the pattern match
            // any prefix of the full path. We do this by generating
            // alternative patterns that match progressively longer prefixes.
            if (this.partial && filtered.length >= 1) {
                const prefixes = [];
                for (let i = 1; i <= filtered.length; i++) {
                    prefixes.push(filtered.slice(0, i).join('/'));
                }
                return '(?:' + prefixes.join('|') + ')';
            }
            return filtered.join('/');
        })
            .join('|');
        // need to wrap in parens if we had more than one thing with |,
        // otherwise only the first will be anchored to ^ and the last to $
        const [open, close] = set.length > 1 ? ['(?:', ')'] : ['', ''];
        // must match entire pattern
        // ending in a * or ** will make it less strict.
        re = '^' + open + re + close + '$';
        // In partial mode, '/' should always match as it's a valid prefix for any pattern
        if (this.partial) {
            re = '^(?:\\/|' + open + re.slice(1, -1) + close + ')$';
        }
        // can match anything, as long as it's not this.
        if (this.negate)
            re = '^(?!' + re + ').+$';
        try {
            this.regexp = new RegExp(re, [...flags].join(''));
            /* c8 ignore start */
        }
        catch {
            // should be impossible
            this.regexp = false;
        }
        /* c8 ignore stop */
        return this.regexp;
    }
    slashSplit(p) {
        // if p starts with // on windows, we preserve that
        // so that UNC paths aren't broken.  Otherwise, any number of
        // / characters are coalesced into one, unless
        // preserveMultipleSlashes is set to true.
        if (this.preserveMultipleSlashes) {
            return p.split('/');
        }
        else if (this.isWindows && /^\/\/[^/]+/.test(p)) {
            // add an extra '' for the one we lose
            return ['', ...p.split(/\/+/)];
        }
        else {
            return p.split(/\/+/);
        }
    }
    match(f, partial = this.partial) {
        this.debug('match', f, this.pattern);
        // short-circuit in the case of busted things.
        // comments, etc.
        if (this.comment) {
            return false;
        }
        if (this.empty) {
            return f === '';
        }
        if (f === '/' && partial) {
            return true;
        }
        const options = this.options;
        // windows: need to use /, not \
        if (this.isWindows) {
            f = f.split('\\').join('/');
        }
        // treat the test path as a set of pathparts.
        const ff = this.slashSplit(f);
        this.debug(this.pattern, 'split', ff);
        // just ONE of the pattern sets in this.set needs to match
        // in order for it to be valid.  If negating, then just one
        // match means that we have failed.
        // Either way, return on the first hit.
        const set = this.set;
        this.debug(this.pattern, 'set', set);
        // Find the basename of the path by looking for the last non-empty segment
        let filename = ff[ff.length - 1];
        if (!filename) {
            for (let i = ff.length - 2; !filename && i >= 0; i--) {
                filename = ff[i];
            }
        }
        for (const pattern of set) {
            let file = ff;
            if (options.matchBase && pattern.length === 1) {
                file = [filename];
            }
            const hit = this.matchOne(file, pattern, partial);
            if (hit) {
                if (options.flipNegate) {
                    return true;
                }
                return !this.negate;
            }
        }
        // didn't get any hits.  this is success if it's a negative
        // pattern, failure otherwise.
        if (options.flipNegate) {
            return false;
        }
        return this.negate;
    }
}
exports.Minimatch = Minimatch;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 3098:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.unescape = void 0;
/**
 * Un-escape a string that has been escaped with {@link escape}.
 *
 * If the {@link MinimatchOptions.windowsPathsNoEscape} option is used, then
 * square-bracket escapes are removed, but not backslash escapes.
 *
 * For example, it will turn the string `'[*]'` into `*`, but it will not
 * turn `'\\*'` into `'*'`, because `\` is a path separator in
 * `windowsPathsNoEscape` mode.
 *
 * When `windowsPathsNoEscape` is not set, then both square-bracket escapes and
 * backslash escapes are removed.
 *
 * Slashes (and backslashes in `windowsPathsNoEscape` mode) cannot be escaped
 * or unescaped.
 *
 * When `magicalBraces` is not set, escapes of braces (`{` and `}`) will not be
 * unescaped.
 */
const unescape = (s, { windowsPathsNoEscape = false, magicalBraces = true, } = {}) => {
    if (magicalBraces) {
        return windowsPathsNoEscape ?
            s.replace(/\[([^/\\])\]/g, '$1')
            : s
                .replace(/((?!\\).|^)\[([^/\\])\]/g, '$1$2')
                .replace(/\\([^/])/g, '$1');
    }
    return windowsPathsNoEscape ?
        s.replace(/\[([^/\\{}])\]/g, '$1')
        : s
            .replace(/((?!\\).|^)\[([^/\\{}])\]/g, '$1$2')
            .replace(/\\([^/{}])/g, '$1');
};
exports.unescape = unescape;
//# sourceMappingURL=unescape.js.map

/***/ }),

/***/ 7528:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __nccwpck_require__) => {

// ESM COMPAT FLAG
__nccwpck_require__.r(__webpack_exports__);

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  ExitCode: () => (/* binding */ ExitCode),
  getInput: () => (/* binding */ getInput),
  setFailed: () => (/* binding */ setFailed),
  setOutput: () => (/* binding */ setOutput),
  summary: () => (/* reexport */ summary),
  warning: () => (/* binding */ warning)
});

;// CONCATENATED MODULE: external "os"
const external_os_namespaceObject = require("os");
;// CONCATENATED MODULE: ./node_modules/osl-actions-core/lib/utils.js
// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sanitizes an input into a string so it can be passed into issueCommand safely
 * @param input input to sanitize into a string
 */
function toCommandValue(input) {
    if (input === null || input === undefined) {
        return '';
    }
    else if (typeof input === 'string' || input instanceof String) {
        return input;
    }
    return JSON.stringify(input);
}
/**
 *
 * @param annotationProperties
 * @returns The command properties to send with the actual annotation command
 * See IssueCommandProperties: https://github.com/actions/runner/blob/main/src/Runner.Worker/ActionCommandManager.cs#L646
 */
function toCommandProperties(annotationProperties) {
    if (!Object.keys(annotationProperties).length) {
        return {};
    }
    return {
        title: annotationProperties.title,
        file: annotationProperties.file,
        line: annotationProperties.startLine,
        endLine: annotationProperties.endLine,
        col: annotationProperties.startColumn,
        endColumn: annotationProperties.endColumn
    };
}
//# sourceMappingURL=utils.js.map
;// CONCATENATED MODULE: ./node_modules/osl-actions-core/lib/command.js


/**
 * Issues a command to the GitHub Actions runner
 *
 * @param command - The command name to issue
 * @param properties - Additional properties for the command (key-value pairs)
 * @param message - The message to include with the command
 * @remarks
 * This function outputs a specially formatted string to stdout that the Actions
 * runner interprets as a command. These commands can control workflow behavior,
 * set outputs, create annotations, mask values, and more.
 *
 * Command Format:
 *   ::name key=value,key=value::message
 *
 * @example
 * ```typescript
 * // Issue a warning annotation
 * issueCommand('warning', {}, 'This is a warning message');
 * // Output: ::warning::This is a warning message
 *
 * // Set an environment variable
 * issueCommand('set-env', { name: 'MY_VAR' }, 'some value');
 * // Output: ::set-env name=MY_VAR::some value
 *
 * // Add a secret mask
 * issueCommand('add-mask', {}, 'secretValue123');
 * // Output: ::add-mask::secretValue123
 * ```
 *
 * @internal
 * This is an internal utility function that powers the public API functions
 * such as setSecret, warning, error, and exportVariable.
 */
function issueCommand(command, properties, message) {
    const cmd = new Command(command, properties, message);
    process.stdout.write(cmd.toString() + external_os_namespaceObject.EOL);
}
const CMD_STRING = '::';
class Command {
    constructor(command, properties, message) {
        if (!command) {
            command = 'missing.command';
        }
        this.command = command;
        this.properties = properties;
        this.message = message;
    }
    toString() {
        let cmdStr = CMD_STRING + this.command;
        if (this.properties && Object.keys(this.properties).length > 0) {
            cmdStr += ' ';
            let first = true;
            for (const key in this.properties) {
                if (this.properties.hasOwnProperty(key)) {
                    const val = this.properties[key];
                    if (val) {
                        if (first) {
                            first = false;
                        }
                        else {
                            cmdStr += ',';
                        }
                        cmdStr += `${key}=${escapeProperty(val)}`;
                    }
                }
            }
        }
        cmdStr += `${CMD_STRING}${escapeData(this.message)}`;
        return cmdStr;
    }
}
function escapeData(s) {
    return toCommandValue(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}
function escapeProperty(s) {
    return toCommandValue(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')
        .replace(/:/g, '%3A')
        .replace(/,/g, '%2C');
}
//# sourceMappingURL=command.js.map
;// CONCATENATED MODULE: external "crypto"
const external_crypto_namespaceObject = require("crypto");
// EXTERNAL MODULE: external "fs"
var external_fs_ = __nccwpck_require__(9896);
;// CONCATENATED MODULE: ./node_modules/osl-actions-core/lib/file-command.js
// For internal use, subject to change.
// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */




function issueFileCommand(command, message) {
    const filePath = process.env[`GITHUB_${command}`];
    if (!filePath) {
        throw new Error(`Unable to find environment variable for file command ${command}`);
    }
    if (!external_fs_.existsSync(filePath)) {
        throw new Error(`Missing file at path: ${filePath}`);
    }
    external_fs_.appendFileSync(filePath, `${toCommandValue(message)}${external_os_namespaceObject.EOL}`, {
        encoding: 'utf8'
    });
}
function prepareKeyValueMessage(key, value) {
    const delimiter = `ghadelimiter_${external_crypto_namespaceObject.randomUUID()}`;
    const convertedValue = toCommandValue(value);
    // These should realistically never happen, but just in case someone finds a
    // way to exploit uuid generation let's not allow keys or values that contain
    // the delimiter.
    if (key.includes(delimiter)) {
        throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
    }
    if (convertedValue.includes(delimiter)) {
        throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
    }
    return `${key}<<${delimiter}${external_os_namespaceObject.EOL}${convertedValue}${external_os_namespaceObject.EOL}${delimiter}`;
}
//# sourceMappingURL=file-command.js.map
;// CONCATENATED MODULE: ./node_modules/osl-actions-core/lib/summary.js
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};


const { access, appendFile, writeFile } = external_fs_.promises;
const SUMMARY_ENV_VAR = 'GITHUB_STEP_SUMMARY';
class Summary {
    constructor() {
        this._buffer = '';
    }
    /**
     * Finds the summary file path from the environment, rejects if env var is not
     * found or file does not exist. Also checks r/w permissions.
     */
    filePath() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._filePath) {
                return this._filePath;
            }
            const pathFromEnv = process.env[SUMMARY_ENV_VAR];
            if (!pathFromEnv) {
                throw new Error(`Unable to find environment variable for $${SUMMARY_ENV_VAR}. Check if your runtime environment supports job summaries.`);
            }
            try {
                yield access(pathFromEnv, external_fs_.constants.R_OK | external_fs_.constants.W_OK);
            }
            catch (_a) {
                throw new Error(`Unable to access summary file: '${pathFromEnv}'. Check if the file has correct read/write permissions.`);
            }
            this._filePath = pathFromEnv;
            return this._filePath;
        });
    }
    /** Wraps content in an HTML tag. */
    wrap(tag, content) {
        if (!content) {
            return `<${tag}>`;
        }
        return `<${tag}>${content}</${tag}>`;
    }
    /**
     * Writes the buffered content to the summary file and empties the buffer.
     * Appends by default; pass `{overwrite: true}` to replace existing contents.
     */
    write(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const overwrite = !!(options === null || options === void 0 ? void 0 : options.overwrite);
            const filePath = yield this.filePath();
            const writeFunc = overwrite ? writeFile : appendFile;
            yield writeFunc(filePath, this._buffer, { encoding: 'utf8' });
            return this.emptyBuffer();
        });
    }
    /** Resets the buffer without writing to the summary file. */
    emptyBuffer() {
        this._buffer = '';
        return this;
    }
    /**
     * Adds raw text to the summary buffer. Optionally appends an EOL.
     */
    addRaw(text, addEOL = false) {
        this._buffer += text;
        return addEOL ? this.addEOL() : this;
    }
    /** Adds an OS-specific end-of-line marker to the buffer. */
    addEOL() {
        return this.addRaw(external_os_namespaceObject.EOL);
    }
    /**
     * Adds an HTML heading element (h1-h6) to the summary buffer.
     */
    addHeading(text, level) {
        const tag = `h${level}`;
        const allowedTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
            ? tag
            : 'h1';
        const element = this.wrap(allowedTag, text);
        return this.addRaw(element).addEOL();
    }
}
const _summary = new Summary();
const summary = _summary;
//# sourceMappingURL=summary.js.map
;// CONCATENATED MODULE: ./node_modules/osl-actions-core/lib/core.js




/**
 * The code to exit an action
 */
var ExitCode;
(function (ExitCode) {
    ExitCode[ExitCode["Success"] = 0] = "Success";
    ExitCode[ExitCode["Failure"] = 1] = "Failure";
})(ExitCode || (ExitCode = {}));
/**
 * Gets the value of an input.
 * Unless trimWhitespace is set to false in InputOptions, the value is also trimmed.
 * Returns an empty string if the value is not defined.
 */
function getInput(name, options) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
    if (options && options.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    if (options && options.trimWhitespace === false) {
        return val;
    }
    return val.trim();
}
/**
 * Sets the value of an output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOutput(name, value) {
    const filePath = process.env['GITHUB_OUTPUT'] || '';
    if (filePath) {
        return issueFileCommand('OUTPUT', prepareKeyValueMessage(name, value));
    }
    process.stdout.write(external_os_namespaceObject.EOL);
    issueCommand('set-output', { name }, toCommandValue(value));
}
/**
 * Adds a warning issue.
 */
function warning(message, properties = {}) {
    issueCommand('warning', toCommandProperties(properties), message instanceof Error ? message.toString() : message);
}
/**
 * Sets the action status to failed.
 * When the action exits it will be with an exit code of 1.
 * Internally emits an `error` issue command for the message (inlined from
 * the upstream `error()` helper, which is no longer exported in this fork).
 */
function setFailed(message) {
    process.exitCode = ExitCode.Failure;
    issueCommand('error', {}, message instanceof Error ? message.toString() : message);
}
/**
 * Summary export — only public-surface needed by Ozark consumers.
 */

//# sourceMappingURL=core.js.map

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/compat */
/******/
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it uses a non-standard name for the exports (exports).
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const constants_1 = __nccwpck_require__(7242);
const config_1 = __nccwpck_require__(2973);
const report_1 = __nccwpck_require__(665);
const remote_1 = __nccwpck_require__(6473);
const scanner_1 = __nccwpck_require__(4105);
const rules_1 = __nccwpck_require__(5755);
async function importCore() {
    return Promise.resolve(/* import() eager */).then(__nccwpck_require__.bind(__nccwpck_require__, 7528));
}
async function run() {
    const core = await importCore();
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const scanRoot = (0, scanner_1.resolveScanRoot)(workspace, core.getInput('path') || '.');
    const configPath = core.getInput('config') || '.deterministic-deps.yml';
    const { config, diagnostics } = (0, config_1.loadConfigWithDiagnostics)(scanRoot, configPath);
    for (const diagnostic of diagnostics) {
        core.warning(diagnostic.message);
    }
    const modeInput = (0, config_1.normalizeModeInput)(core.getInput('mode'), config.mode ?? 'advisory');
    const severityThresholdInput = (0, config_1.normalizeSeverityInput)(core.getInput('severity-threshold'), config.severityThreshold ?? 'low');
    const sarifInput = (0, config_1.normalizeBooleanInput)(core.getInput('sarif'), 'sarif', true);
    const patchInput = (0, config_1.normalizeBooleanInput)(core.getInput('patch'), 'patch', config.patch ?? false);
    const remoteValidationInput = (0, config_1.normalizeBooleanInput)(core.getInput('remote-validation'), 'remote-validation', config.remoteValidation ?? false);
    const remoteTokenPolicyInput = (0, config_1.normalizeRemoteTokenPolicyInput)(core.getInput('remote-token-policy'), config.remoteTokenPolicy ?? 'auto');
    const remoteValidationTimeoutMsInput = (0, config_1.normalizePositiveIntegerInput)(core.getInput('remote-timeout-ms'), 'remote-timeout-ms', config.remoteValidationTimeoutMs ?? remote_1.DEFAULT_TIMEOUT_MS, config_1.MAX_REMOTE_TIMEOUT_MS);
    const remoteValidationRetriesInput = (0, config_1.normalizePositiveIntegerInput)(core.getInput('remote-retries'), 'remote-retries', config.remoteValidationRetries ?? remote_1.DEFAULT_RETRIES, config_1.MAX_REMOTE_RETRIES);
    for (const diagnostic of [
        ...modeInput.diagnostics,
        ...severityThresholdInput.diagnostics,
        ...sarifInput.diagnostics,
        ...patchInput.diagnostics,
        ...remoteValidationInput.diagnostics,
        ...remoteTokenPolicyInput.diagnostics,
        ...remoteValidationTimeoutMsInput.diagnostics,
        ...remoteValidationRetriesInput.diagnostics
    ]) {
        core.warning(diagnostic.message);
    }
    const mode = modeInput.value;
    const severityThreshold = severityThresholdInput.value;
    const include = (0, config_1.splitPatterns)(core.getInput('include'));
    const exclude = (0, config_1.splitPatterns)(core.getInput('exclude'));
    const sarif = sarifInput.value;
    const patch = patchInput.value;
    const remoteValidation = remoteValidationInput.value;
    const remoteTokenPolicy = remoteTokenPolicyInput.value;
    const remoteValidationTimeoutMs = remoteValidationTimeoutMsInput.value;
    const remoteValidationRetries = remoteValidationRetriesInput.value;
    const result = await (0, scanner_1.scan)({
        root: scanRoot,
        include: include.length > 0 ? include : (config.include ?? constants_1.DEFAULT_INCLUDE),
        exclude: exclude.length > 0 ? exclude : (config.exclude ?? constants_1.DEFAULT_EXCLUDE),
        config: {
            ...config,
            remoteValidation,
            remoteTokenPolicy,
            remoteValidationTimeoutMs,
            remoteValidationRetries
        }
    });
    for (const diagnostic of result.diagnostics) {
        core.warning(diagnostic.message);
    }
    for (const finding of result.findings) {
        core.warning(`${finding.message} ${finding.remediation}`, {
            file: finding.file,
            startLine: finding.line,
            title: finding.ruleId
        });
    }
    const reports = (0, report_1.writeReports)(scanRoot, result.findings, sarif, patch);
    const counts = (0, report_1.countBySeverity)(result.findings);
    core.setOutput('finding-count', result.findings.length.toString());
    core.setOutput('high-count', counts.high.toString());
    core.setOutput('medium-count', counts.medium.toString());
    core.setOutput('low-count', counts.low.toString());
    core.setOutput('report-path', reports.markdownPath);
    core.setOutput('sarif-path', reports.sarifPath ?? '');
    core.setOutput('patch-path', reports.patchPath ?? '');
    await writeSummary(result.scannedFiles.length, result.findings.length, counts, reports.markdownPath, core);
    if (mode === 'enforce' && (0, rules_1.shouldReportFailure)(result.findings, severityThreshold)) {
        core.setFailed(`deterministic-deps found ${result.findings.length} finding(s) at or above ${severityThreshold} severity.`);
    }
}
run().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    try {
        const core = await importCore();
        core.setFailed(message);
    }
    catch {
        console.error(message);
        process.exitCode = 1;
    }
});
async function writeSummary(scannedFiles, findingCount, counts, markdownPath, core) {
    try {
        await core.summary
            .addHeading('deterministic-deps')
            .addRaw(`Scanned ${scannedFiles} files.\n\n`)
            .addRaw(`Findings: ${findingCount} (${counts.high} high, ${counts.medium} medium, ${counts.low} low)\n\n`)
            .addRaw(`Report: ${markdownPath}\n`)
            .write();
    }
    catch (error) {
        core.warning(`Unable to write job summary: ${error instanceof Error ? error.message : String(error)}`);
    }
}

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map