const basicAuth = require('basic-auth')

const { CAIT_USERNAME, CAIT_PASSWORD } = process.env

// Authenticator
const auth = (req, res, next) => {
  if (!CAIT_USERNAME) {
    return next()
  }
  if (req.connection.remoteAddress.includes('127.0.0.1')) {
    return next()
  }
  function unauthorized (res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required')
    return res.sendStatus(401)
  }

  const user = basicAuth(req)

  if (!user || !user.name || !user.pass) {
    return unauthorized(res)
  }
  if (user.name === CAIT_USERNAME && user.pass === CAIT_PASSWORD) {
    return next()
  } else {
    return unauthorized(res)
  }
}

module.exports = auth
