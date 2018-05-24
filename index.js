const path = require('path');

/**
 * @typedef {Object} UseEntry
 * @property {string|function} loader
 * @property {string|object} [query]
 * @property {string|object} [options]
 * @private
 * @link https://webpack.js.org/configuration/module/#useentry
 */

/**
 * Some of the keys from Rule object we care about include:
 *
 * @typedef {Object} Rule
 * @property {*} [loader]
 * @property {*} [loaders]
 * @property {*} [query]
 * @property {*} [options]
 * @property {UseEntry|UseEntry[]|function|string} [use]
 * @property {Rule[]} [oneOf]
 * @property {Rule[]} [rules]
 * @private
 * @link https://webpack.js.org/configuration/module/#rule
 */

/**
 * Iterates over webpack rules array recursively, calling callback for every rule encountered
 *
 * @param {Rule[]} rules
 * @param {Function} callback - return false to interrupt
 * @param {{interrupted: boolean}} [_carry] - private, used to communicate back from recursive calls
 * @return {boolean}
 * @private
 */
function _iterateRulesDeep(rules, callback, _carry={ interrupted: false }) {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];

    // call callback for this rule
    if (_carry.interrupted || callback(rule) === false) {
      _carry.interrupted = false;
      break;
    }

    // go deeper
    _iterateRulesDeep(Array.isArray(rule.rules) ? rule.rules : [], callback, _carry);
    _iterateRulesDeep(Array.isArray(rule.oneOf) ? rule.oneOf : [], callback, _carry);
  }
}

// Directly copied from Webpack sources: RuleSet.normalizeUseItemString
function _normalizeUseItemString(useItemString) {
  const index = useItemString.indexOf("?");
  if(index >= 0) {
    return {
      loader: useItemString.substr(0, index),
      options: useItemString.substr(index + 1)
    };
  }
  return {
    loader: useItemString
  };
}

function _deleteLoaderKeys(rule, withOptions = false) {
  delete rule.loader;
  delete rule.loaders;

  if (withOptions) {
    delete rule.query;
    delete rule.options;
  }
}

/**
 * Moves loaders under 'use' key of needed, converts it to array form
 *
 * @param {Rule} rule
 * @return {Rule}
 * @private
 */
function _normalizeUseEntriesWithinRule(rule) {
  /* Convert legacy .loader(s) keys to .use */

  if (!rule.use) {
    // Designed after original logic: https://github.com/webpack/webpack/blob/798eaa834a/lib/RuleSet.js#L200-L215
    const loader = rule.loaders || rule.loader;
    const loaderIsStr = typeof loader === 'string';

    if (loaderIsStr && !rule.options && !rule.query) {
      rule.use = loader.split('!');
      _deleteLoaderKeys(rule);
    } else if (loaderIsStr && !rule.options !== !rule.query) {
      rule.use = {
        loader: loader,
        options: rule.options,
        query: rule.query
      };
      _deleteLoaderKeys(rule, true);
    } else if (loader && !(rule.options || rule.query)) {
      rule.use = loader;
      _deleteLoaderKeys(rule);
    } else {
      // Any other configuration which includes loader is invalid
      // We will simply ignore it and let Webpack throw error later
    }
  }

  /* Normalize rule.use */

  // { test: /\.jsx?$/, use: 'babel-loader' } => { test: /\.jsx?$/, use: ['babel-loader'] }
  if (rule.use && !Array.isArray(rule.use)) {
    rule.use = [ rule.use ];
  }

  // { ... , use: ['babel-loader'] => { ... , use: [{ loader: 'babel-loader' }] }
  if (Array.isArray(rule.use)) {
    rule.use = rule.use.map(entry => typeof entry === 'string' ? _normalizeUseItemString(entry) : entry);
  }

  return rule;
}

/**
 * Pre-processes matcher and turns it into a function in case it's not
 *
 * @param {function|string|RegExp} loaderMatcher
 * @return {function}
 * @private
 */
function _normalizeLoaderMatcher(loaderMatcher) {
  let matcher = loaderMatcher;

  if (loaderMatcher instanceof RegExp) {
    matcher = (entry) => entry.loader.search(loaderMatcher) !== -1;
  } else if (typeof loaderMatcher === 'string') {
    let matcherBase = loaderMatcher.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
    matcherBase = path.sep === '\\' ? matcherBase.replace(/\//g, '(?:\/|\\\\)') : matcherBase;
    const pattern = new RegExp(`\\b${matcherBase}\\b`, 'i');

    matcher = function(entry) {
      const index = entry.loader.lastIndexOf(`${path.sep}node_modules${path.sep}`);
      const strToTest = entry.loader.substr(index < 0 ? 0 : index + '/node_modules/'.length);
      return strToTest.search(pattern) !== -1;
    }
  } else if (typeof loaderMatcher !== 'function') {
    throw new TypeError('Invalid `loaderMatcher` parameter type');
  }

  return matcher;
}

/**
 * Searches UseEntries with its closest Rule by calling loaderMatcher on UseEntry.
 *
 * @param {Rule[]} rules
 * @param {function|string|RegExp} loaderMatcher function to be executed on useEntries
 * @param {boolean} [stopAfterFirstFound]
 * @return {Array.<{rule: Object, useEntry: Object}>}
 * @private
 */
function _findByLoader(rules, loaderMatcher, stopAfterFirstFound = false) {
  const matcher = _normalizeLoaderMatcher(loaderMatcher);
  const results = [];

  _iterateRulesDeep(rules, rule => {
    _normalizeUseEntriesWithinRule(rule);

    if (!Array.isArray(rule.use)) return;

    for (let i = 0; i < rule.use.length; i += 1) {
      const useEntry = rule.use[i];
      const matches = matcher(useEntry);

      if (matches) {
        results.push({ rule: rule, useEntry: useEntry });
        if (stopAfterFirstFound) return false; // interrupt for loop and recursive iteration
      }
    }
  });

  return results;
}

// Public API:

/**
 * @param rules
 * @param matcher
 * @return {UseEntry|null}
 */
function getLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, true);
  return findings.length ? (findings[0].useEntry) : null;
}

/**
 * @param rules
 * @param matcher
 * @return {Rule|null}
 */
function getRuleByLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, true);
  return findings.length ? (findings[0].rule) : null;
}

/**
 * @param rules
 * @param matcher
 * @return {UseEntry[]}
 */
function getAllLoaders(rules, matcher) {
  const findings = _findByLoader(rules, matcher, false);
  return findings.map(both => both.useEntry);
}

/**
 * @param rules
 * @param matcher
 * @return {Rule[]}
 */
function getAllRulesByLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, false);
  return findings.map(both => both.rule);
}

/**
 * @param {Rule[]} rules
 * @param {Rule|UseEntry} ruleOrUseEntry
 * @return {Rule|null} null will be returned if it's a top level rule
 */
function getParentRule(rules, ruleOrUseEntry) {
  let result = null;

  _iterateRulesDeep(rules, (rule) => {
    _normalizeUseEntriesWithinRule(rule);

    const isInRules = Array.isArray(rule.rules) && rule.rules.includes(ruleOrUseEntry);
    const isInOneOf = Array.isArray(rule.oneOf) && rule.oneOf.includes(ruleOrUseEntry);
    const isInUseEntries = Array.isArray(rule.use) && rule.use.includes(ruleOrUseEntry);

    if (isInRules || isInOneOf || isInUseEntries) {
      result = rule;
      return false;
    }
  });

  return result;
}

/**
 * Inserts element to array at position of another element
 * @param array
 * @param targetItem
 * @param itemToInsert
 * @param addToIndex
 * @return {boolean}
 * @private
 */
function _insertAtPositionOf(array, targetItem, itemToInsert, addToIndex = 0) {
  if (!Array.isArray(array)) return false;
  const index = array.indexOf(targetItem);
  if (index === -1) return false;
  array.splice(index + addToIndex, 0, itemToInsert);
  return true;
}

/**
 * Inserts rule before another rule
 * @param {Rule[]} rules
 * @param {Rule} beforeRule
 * @param {Rule} newRule
 * @return {boolean}
 */
function insertBeforeRule(rules, beforeRule, newRule) {
  if (rules.includes(beforeRule)) {
    return _insertAtPositionOf(rules, beforeRule, newRule, 0);
  }

  const parent = getParentRule(rules, beforeRule);

  if (!!parent && _insertAtPositionOf(parent.rules, beforeRule, newRule, 0)) return true;
  if (!!parent && _insertAtPositionOf(parent.oneOf, beforeRule, newRule, 0)) return true;

  return false;
}

/**
 * Inserts rule after another rule
 * @param {Rule[]} rules
 * @param {Rule} afterRule
 * @param {Rule} newRule
 * @return {boolean}
 */
function insertAfterRule(rules, afterRule, newRule) {
  if (rules.includes(afterRule)) {
    return _insertAtPositionOf(rules, afterRule, newRule, 1);
  }

  const parent = getParentRule(rules, afterRule);

  if (!!parent && _insertAtPositionOf(parent.rules, afterRule, newRule, 1)) return true;
  if (!!parent && _insertAtPositionOf(parent.oneOf, afterRule, newRule, 1)) return true;

  return false;
}

/**
 * Inserts use entry before another use entry
 * @param {Rule[]} rules
 * @param {UseEntry} beforeUseEntry
 * @param {UseEntry} newUseEntry
 * @return {boolean}
 */
function insertBeforeUseEntry(rules, beforeUseEntry, newUseEntry) {
  const parent = getParentRule(rules, beforeUseEntry);
  return !!parent && _insertAtPositionOf(parent.use, beforeUseEntry, newUseEntry, 0);
}

/**
 * Inserts use entry after another use entry
 * @param {Rule[]} rules
 * @param {UseEntry} afterUseEntry
 * @param {UseEntry} newUseEntry
 * @return {boolean}
 */
function insertAfterUseEntry(rules, afterUseEntry, newUseEntry) {
  const parent = getParentRule(rules, afterUseEntry);
  return !!parent && _insertAtPositionOf(parent.use, afterUseEntry, newUseEntry, 1);
}

function normalizeRuleset(rules) {
  _iterateRulesDeep(rules, rule => {
    _normalizeUseEntriesWithinRule(rule);
  });
}

module.exports = {
  getLoader,
  getRuleByLoader,
  getAllLoaders,
  getAllRulesByLoader,
  getParentRule,
  insertBeforeRule,
  insertAfterRule,
  insertBeforeUseEntry,
  insertAfterUseEntry,
  normalizeRuleset,
};
