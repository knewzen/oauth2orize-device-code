var merge = require('utils-merge')
  , AuthorizationError = require('../errors/authorizationerror')
  , TokenError = require('../errors/tokenerror');


// https://tools.ietf.org/html/draft-ietf-oauth-device-flow-03
// https://developers.google.com/identity/protocols/OAuth2ForDevices

module.exports = function(options, issue) {
  if (typeof options == 'function') {
    issue = options;
    options = undefined;
  }
  options = options || {};
  
  if (!issue) { throw new TypeError('deviceAuthorization middleware requires an issue function'); }
  
  var verificationURI = options.verificationURI;
  var userProperty = options.userProperty || 'user';
  
  // For maximum flexibility, multiple scope spearators can optionally be
  // allowed.  This allows the server to accept clients that separate scope
  // with either space or comma (' ', ',').  This violates the specification,
  // but achieves compatibility with existing client libraries that are already
  // deployed.
  var separators = options.scopeSeparator || ' ';
  if (!Array.isArray(separators)) {
    separators = [ separators ];
  }
  
  
  return function deviceAuthorization(req, res, next) {
    if (!req.body) { return next(new Error('OAuth2orize requires body parsing. Did you forget to use body-parser middleware?')); }
    
    // The 'user' property of `req` holds the authenticated user.  In the case
    // of the token endpoint, the property will contain the OAuth 2.0 client.
    var client = req[userProperty]
      , scope = req.body.scope;
    
    if (scope) {
      if (typeof scope !== 'string') {
        return next(new AuthorizationError('Invalid parameter: scope must be a string', 'invalid_request'));
      }
      
      for (var i = 0, len = separators.length; i < len; i++) {
        var separated = scope.split(separators[i]);
        // only separate on the first matching separator.  this allows for a sort
        // of separator "priority" (ie, favor spaces then fallback to commas)
        if (separated.length > 1) {
          scope = separated;
          break;
        }
      }
      if (!Array.isArray(scope)) { scope = [ scope ]; }
    }
    
    function issued(err, deviceCode, userCode, params) {
      if (err) { return next(err); }
      if (!deviceCode) { return next(new AuthorizationError('Request denied by authorization server', 'access_denied')); }

      var tok = {};
      tok.device_code = deviceCode;
      tok.user_code = userCode;
      tok.verification_uri = verificationURI;
      if (params) { merge(tok, params); }
      
      var json = JSON.stringify(tok);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(json);
    }
    
    try {
      var arity = issue.length;
      if (arity == 5) {
        issue(client, scope, req.body, req.authInfo, issued);
      } else if (arity == 4) {
        issue(client, scope, req.body, issued);
      } else if (arity == 3) {
        issue(client, scope, issued);
      } else { // arity == 2
        issue(client, issued);
      }
    } catch (ex) {
      return next(ex);
    }
  }
}
