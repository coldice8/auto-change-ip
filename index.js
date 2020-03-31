const axios = require("axios");
const ping = require("net-ping");
const AWS = require('aws-sdk');
const config = require('./config');

const godaddyInstance = axios.create({
  baseURL: config.godaddyUrl
});

// 接口添加 Godaddy 的授权认证
godaddyInstance.defaults.headers.common['Authorization'] = `sso-key ${config.godaddyKey}:${config.godaddySecret}`;

/*
godaddyInstance.get("/v1/domains").then(res => {
  if (res.status === 200) {
    console.log('====================================');
    console.log(res.data);
    console.log('====================================');
  }
}).catch(err => {
  console.error(err);
});
*/

// 获取 Godaddy 某域名的 A 类型某名称对应的 ip
function getGodaddyDnsIp(dnsName) {
  return new Promise(function (resolve, reject) {
    godaddyInstance.get(`/v1/domains/${config.domain}/records/A/${dnsName}`)
      .then(res => {
        if (res.status === 200) {
          const [{ data }] = res.data;
          resolve(data);
        }
      })
      .catch(err => {
        reject(err);
      });
  })
}

// 设置 Godaddy 某域名的 A 类型某名称对应的 ip
function setGodaddyDnsIp(vps) {
  return new Promise(function (resolve, reject) {
    const params = [{
      "data": vps.ip,
      "ttl": 600,
    }];
    godaddyInstance.put(`/v1/domains/${config.domain}/records/A/${vps.dnsName}`, params)
      .then(res => {
        if (res.status === 200) {
          resolve();
        }
      })
      .catch(err => {
        reject(err);
      });
  })
}

// 删除关联的 ip，分配新 ip，并关联绑定服务器示例
function operationStaticIp(vps) {
  const lightsail = new AWS.Lightsail({
    accessKeyId: config.AWSAccessKeyId,
    secretAccessKey: config.AWSSecretKey,
    region: vps.region
  });
  lightsail.releaseStaticIp({ staticIpName: vps.staticIpName }, function (err, data) {
    if (!err) {
      console.log('删除旧的静态 IP 成功！');
      lightsail.allocateStaticIp({ staticIpName: vps.staticIpName }, function (err, data) {
        if (!err) {
          console.log('分配新的静态 IP 成功！');
          lightsail.attachStaticIp({ instanceName: vps.instanceName, staticIpName: vps.staticIpName }, function (err, data) {
            if (!err) {
              console.log('新 IP 绑定成功！');
              lightsail.getStaticIp({ staticIpName: vps.staticIpName }, function (err, data) {
                const { staticIp: { ipAddress } } = data;
                const newVps = { ...vps, ip: ipAddress };
                setGodaddyDnsIp(newVps);
              })
            } else {
              console.error(err, err.stack);
            }
          })
        } else {
          console.error(err, err.stack);
        }
      });
    } else {
      console.error(err, err.stack);
    }
  });
}

// 解除绑定 AWS 服务器实例绑定的静态 ip，并申请新的 ip，再绑定
function changeAWSLightsailVpsIp(vps) {
  const lightsail = new AWS.Lightsail({
    accessKeyId: config.AWSAccessKeyId,
    secretAccessKey: config.AWSSecretKey,
    region: vps.region
  });
  lightsail.getStaticIp({ staticIpName: vps.staticIpName }, function (err, data) {
    if (!err) {
      const { staticIp: { ipAddress } } = data;
      if (ipAddress !== vps.ip) {
        checkIpWork(ipAddress, (isConnected) => {
          if (isConnected) {
            setGodaddyDnsIp(vps);
          } else {
            operationStaticIp(vps);
          }
        })
      } else {
        operationStaticIp(vps);
      }
    }
  })
}

/**
 * 检查 ip 是否已经被封锁
 * @param {string} ip 
 * @param {function} callback 
 */
function checkIpWork(ip, callback) {
  const options = {
    networkProtocol: ping.NetworkProtocol.IPv4,
    packetSize: 16,
    retries: 4, // 每个 ip 重复 ping 4 次，还是 ping 不通的话，视为 blocked
    // sessionId: (process.pid % 65535),
    sessionId: Math.round(Math.random() * 65535),
    timeout: 2000,
    ttl: 128
  };
  const session = ping.createSession(options);
  session.pingHost(ip, function (error, target) {
    if (error) {
      console.log(`${target}: ${error.toString()}`);
    }
    else {
      console.log(`${target}: Alive`);
    }
    if (callback) callback(!error);
  });
}

// 检查服务器列表里 Godaddy 域名对应的 ip 是否被封，如果被封，更换 ip
function checkVpsListNChangeIp() {
  config.vpsList.forEach((vps) => {
    getGodaddyDnsIp(vps.dnsName)
      .then(ip => {
        vps.ip = ip;
        checkIpWork(vps.ip, (isConnected) => {
          if (!isConnected) {
            changeAWSLightsailVpsIp(vps);
          }
        });
      })
      .catch(err => {
        console.error(err);
      })
  })
}

checkVpsListNChangeIp();
setInterval(() => {
  checkVpsListNChangeIp();
}, config.cycleTime)

/*
const lightsail = new AWS.Lightsail({
  accessKeyId: config.AWSAccessKeyId,
  secretAccessKey: config.AWSSecretKey,
  region: 'us-west-2'
});
lightsail.getInstances({}, function (err, data) {
  if (err)
    console.log(err, err.stack); // an error occurred
  else
    console.log(data);           // successful response
});
*/