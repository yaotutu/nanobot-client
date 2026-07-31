/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!--
    nanobot gateways are user-provided and frequently run plain HTTP on a LAN
    (e.g. http://192.168.x.x:8765). Permit cleartext on the base config so the
    client can reach any user-configured gateway host; HTTPS (wss) is still
    supported automatically when the gateway uses TLS.
  -->
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withNanobotNetworkSecurity(config) {
  config = withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return manifestConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (dangerousConfig) => {
      const xmlDirectory = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDirectory, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDirectory, 'network_security_config.xml'),
        NETWORK_SECURITY_XML,
        'utf8',
      );
      return dangerousConfig;
    },
  ]);
}

module.exports = withNanobotNetworkSecurity;
