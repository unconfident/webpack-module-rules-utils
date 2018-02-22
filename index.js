/**
 * @typedef {Object} UseEntry
 * @property {string|function} loader
 * @property {string|object} [query]
 * @property {string|object} [options]
 * @private
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
 * Searches UseEntries with its closest Rule by calling loaderMatcher on UseEntry.
 *
 * @param {Rule[]} rules
 * @param {function} loaderMatcher
 * @param {boolean} [stopAfterFirstFound]
 * @return {Array.<{rule: Object, useEntry: Object}>}
 * @private
 */
function _findByLoader(rules, loaderMatcher, stopAfterFirstFound = false) {
  const results = [];

  _iterateRulesDeep(rules, rule => {
    _normalizeUseEntriesWithinRule(rule);

    if (!Array.isArray(rule.use)) return;

    for (let i = 0; i < rule.use.length; i += 1) {
      const useEntry = rule.use[i];
      const matches = loaderMatcher(useEntry);

      if (matches) {
        results.push({ rule: rule, useEntry: useEntry });
        if (stopAfterFirstFound) return false; // interrupt for loop and recursive iteration
      }
    }
  });

  return results;
}

// Public API:

export function getLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, true);
  return findings.length ? (findings[0].useEntry) : null;
}

export function getRuleByLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, true);
  return findings.length ? (findings[0].rule) : null;
}

export function getAllLoaders(rules, matcher) {
  const findings = _findByLoader(rules, matcher, false);
  return findings.map(both => both.useEntry);
}

export function getAllRulesByLoader(rules, matcher) {
  const findings = _findByLoader(rules, matcher, false);
  return findings.map(both => both.rule);
}

// TODO
export function getParentRule(rules, ruleOrUseEntry) {

}

// TODO
export function insertBeforeRule(rules, beforeRule, newRule) {

}

// TODO
export function insertAfterRule(rules, beforeRule, newRule) {

}

// TODO
export function insertBeforeUseEntry(rules, beforeRule, newRule) {

}

// TODO
export function insertAfterUseEntry(rules, beforeRule, newRule) {

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
  insertAfterUseEntry
};
