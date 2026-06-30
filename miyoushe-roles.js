async function loadGameRoles(activeSession) {
  const result = await requestWithCookies(MYS_ENDPOINTS.rolesByCookie, activeSession, 'record', {
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
  })).filter((row) => row.uid);
}
