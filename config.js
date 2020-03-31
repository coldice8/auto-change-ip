// const godaddyUrl = "https://api.ote-godaddy.com" // 测试版 Godaddy 域名
const godaddyUrl = "https://api.godaddy.com" // 生产版 Godaddy 域名
const domain = "xxxxxx.com"; // 需更更新的域名,比如 your_domain_here.com
// Godday API key 创建地址：https://developer.godaddy.com/keys
const godaddyKey = "UzQxLikm_46KxDFnbjN7cQjmw6wocia"; // 你的 Godaddy Key
const godaddySecret = "46L26ydpkwMaKZV6uVdDWe"; // 你的 Godaddy Secret
// AWS 访问密钥创建地址：https://console.aws.amazon.com/iam/home#/security_credentials
const AWSAccessKeyId = "XXXXX" // 你的 AWS 账号 ID
const AWSSecretKey = "XXXXX" // 你的 AWS 秘钥
const cycleTime = 1000 * 60 * 10 // 这里默认是 10 分钟循环一次

/**
 * 需检查的服务器和更新的 A 记录列表
 * 注意下面的参数一定是要一一对应的
 * dnsName: Godaddy 的域名的名称
 * instanceName: AWS 服务器实例名
 * staticIpName: AWS 实例绑定的静态 ip 名
 * region: AWS 服务器实例所在的地区
 */
const vpsList = [
  { dnsName: 'test01', instanceName: 'test01', staticIpName: 'StaticIp-test01', region: 'us-west-2' },
  { dnsName: 'test02', instanceName: 'test02', staticIpName: 'StaticIp-test02', region: 'us-west-2' },
];

module.exports = {
  godaddyUrl,
  domain,
  godaddyKey,
  godaddySecret,
  AWSAccessKeyId,
  AWSSecretKey,
  cycleTime,
  vpsList
}