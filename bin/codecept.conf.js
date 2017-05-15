const os = require('os')
let hostIp
const iface = process.env.interface || 'en0'
const interfaces = os.networkInterfaces()
if (interfaces[iface]) {
  hostIp = interfaces[iface].filter(i => i.family === 'IPv4').map(i => i.address)[0]
}

const baseProtocol = process.env.baseProtocol || 'http'
let basePort = process.env.basePort === undefined ? 3000 : process.env.basePort
if (basePort) {
  basePort = `:${basePort}`
}
const baseIp = process.env.baseIp || hostIp
const baseUrl = process.env.baseUrl || `${baseProtocol}://${baseIp}${basePort}`
const seleniumProtocol = process.env.seleniumProtocol || 'http'
const seleniumPort = process.env.seleniumPort || 4444
const seleniumIp = process.env.seleniumIp || hostIp
const seleniumUrl = `${seleniumProtocol}://${seleniumIp}:${seleniumPort}`

console.log('Codecept config', {baseUrl, seleniumUrl})

const tests = process.env.tests || `spec/functional/*.functional.spec.js`
const output = process.env.output || `reports`

const config = {
  tests,
  timeout: 10000,
  output,
  helpers: {
    WebDriverIO: {
      url: baseUrl,
      browser: 'firefox',
      protocol: seleniumProtocol,
      host: seleniumIp,
      port: seleniumPort,
      path: '/wd/hub'
    }
  },
  bootstrap: false,
  mocha: {},
  name: 'moj-express-kit'
}

exports.config = config
