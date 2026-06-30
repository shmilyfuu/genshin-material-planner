const MYS_K2_SALT = 'sfYPEgpxkOe1I3XVMLdwp1Lyt9ORgZsq';

function createDsV1() {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = randomId(6);
  return `${timestamp},${random},${md5(`salt=${MYS_K2_SALT}&t=${timestamp}&r=${random}`)}`;
}

async function getGameRoleActionTicket(activeSession) {
  const url = `https://api-takumi.mihoyo.com/auth/api/getActionTicketBySToken?action_type=game_role&stoken=${encodeURIComponent(activeSession.stoken)}&uid=${encodeURIComponent(activeSession.stuid)}`;
  const result = await requestWithCookies(url, activeSession, 'stoken', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      DS: createDsV1(),
      'x-rpc-app_version': MYS_APP_VERSION,
      'x-rpc-client_type': '5',
      'x-rpc-device_id': activeSession.deviceId,
      'x-rpc-device_fp': activeSession.deviceFp
    }
  });
  if (result.payload?.retcode !== 0 || !result.payload?.data?.ticket) {
    throw apiError(result.payload, '无法获取游戏角色授权票据');
  }
  return result.payload.data.ticket;
}

async function loadGameRoles(activeSession) {
  const actionTicket = await getGameRoleActionTicket(activeSession);
  const url = `https://api-takumi.mihoyo.com/binding/api/getUserGameRoles?action_ticket=${encodeURIComponent(actionTicket)}&game_biz=hk4e_cn`;
  const result = await requestWithCookies(url, activeSession, 'record', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-rpc-app_version': MYS_APP_VERSION,
      'x-rpc-client_type': '5',
      'x-rpc-device_id': activeSession.deviceId,
      'x-rpc-device_fp': activeSession.deviceFp
    }
  });
  const rows = result.payload?.data?.list;
  if (!Array.isArray(rows)) throw apiError(result.payload, '无法读取绑定角色');
  return rows.map((row) => ({
    uid: String(row.game_uid || row.role_id || ''),
    nickname: row.nickname || '',
    region: row.region || '',
    regionName: row.region_name || '',
    level: Number(row.level || 0)
  })).filter((row) => row.uid && row.region);
}
