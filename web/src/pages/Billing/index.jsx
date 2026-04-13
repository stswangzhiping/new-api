import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Tag,
  Button,
  Form,
  Empty,
  Typography,
  Toast,
} from '@douyinfe/semi-ui';
import { IconSearch, IconDownload } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { API, showError } from '../../helpers';
import { isAdmin } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

// ─── Quota 换算（纯数字，不含符号） ──────────────────────────────────────────
function getCurrencyInfo() {
  const displayType  = localStorage.getItem('quota_display_type') || 'USD';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '500000');
  let symbol = '$';
  let rate   = 1;
  try {
    const s = JSON.parse(localStorage.getItem('status') || '{}');
    if (displayType === 'CUSTOM') {
      symbol = s?.custom_currency_symbol || '✦';
      rate   = parseFloat(s?.custom_currency_exchange_rate || '1');
    } else if (displayType === 'CNY') {
      symbol = '¥';
      rate   = parseFloat(s?.usd_exchange_rate || '7');
    }
  } catch {}
  return { displayType, quotaPerUnit, symbol, rate };
}

function qToNum(quota) {
  const { displayType, quotaPerUnit, rate } = getCurrencyInfo();
  if (displayType === 'TOKENS') return quota.toLocaleString();
  const usd = quota / quotaPerUnit;
  const val = displayType === 'USD' ? usd : usd * rate;
  const decimals = val >= 100 ? 0 : val >= 1 ? 2 : 4;
  return val.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function monthStr(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function formatTs(ts) {
  if (!ts || ts <= 0) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}
function parseBreakdown(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}
function maskKey(key) {
  if (!key || key.length <= 8) return key;
  return key.slice(0, 4) + '····' + key.slice(-4);
}

const SOURCE_LABEL = { 0: '未知', 1: '活动赠送', 2: '用户购买' };

// ─── PDF 生成 ──────────────────────────────────────────────────────────────────
async function generatePdf(row, usernameMap, t) {
  const { symbol } = getCurrencyInfo();
  const month = `${row.year}年${row.month}月`;

  // 用户信息（自己或被 admin 查看的用户）
  let userName = '—', userAccount = '—', companyName = '';
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    userName    = stored.display_name || stored.username || '—';
    userAccount = stored.username || '—';
  } catch {}

  // admin 查看他人账单时，覆盖用户名
  if (isAdmin() && row.user_id) {
    const mapped = usernameMap[row.user_id];
    if (mapped) { userName = mapped; userAccount = mapped; }
  }

  // 拉当月充值明细
  let topupRows = [];
  try {
    const mStart = new Date(row.year, row.month - 1, 1).getTime() / 1000;
    const mEnd   = new Date(row.year, row.month,     1).getTime() / 1000;
    const uid    = isAdmin() && row.user_id ? row.user_id : null;
    const url    = uid
      ? `/api/redemption/?p=1&page_size=500&used_user_id=${uid}`
      : '/api/redemption/self?p=1&page_size=500';
    const res = await API.get(url);
    if (res.data?.success) {
      const data  = res.data.data;
      const items = Array.isArray(data) ? data : data?.items ?? [];
      topupRows = items.filter(
        r => r.redeemed_time >= mStart && r.redeemed_time < mEnd
      );
    }
  } catch {}

  const breakdown = parseBreakdown(row.model_breakdown);

  const breakdownRows = breakdown.length
    ? breakdown.map(r => `<tr>
        <td class="model-cell">${r.model || '—'}</td>
        <td class="r">${(r.calls || 0).toLocaleString()}</td>
        <td class="r">${(r.promptTokens || 0).toLocaleString()}</td>
        <td class="r">${(r.completionTokens || 0).toLocaleString()}</td>
        <td class="r expense mono">${qToNum(r.quota || 0)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-row">暂无模型消费明细</td></tr>`;

  const topupDetailRows = topupRows.length
    ? topupRows.map(r => `<tr>
        <td class="mono">${new Date(r.redeemed_time * 1000).toLocaleString('zh-CN', { hour12: false })}</td>
        <td class="mono key-col">${maskKey(r.key)}</td>
        <td>${r.name || '—'}</td>
        <td class="r income mono">${qToNum(r.quota || 0)}</td>
        <td class="center">${SOURCE_LABEL[r.cc_source] ?? '未知'}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-row">本月暂无充值记录</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<title>月度账单 ${row.year}年${row.month}月</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif;
         color: #303133; background: #fff; padding: 48px 56px; font-size: 13px; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start;
                 border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 28px; }
  .doc-title  { font-size: 22px; font-weight: 700; color: #1a1a2e; }
  .doc-period { font-size: 13px; color: #6366f1; margin-top: 4px; font-weight: 600; }
  .meta-area  { text-align: right; line-height: 1.9; color: #606266; }
  .meta-label { color: #909399; font-size: 11px; }
  .user-bar { background: #f5f7fa; border-radius: 8px; padding: 14px 20px;
              display: flex; gap: 40px; margin-bottom: 28px; flex-wrap: wrap; }
  .uf-label { font-size: 11px; color: #909399; margin-bottom: 2px; }
  .uf-value { font-size: 13px; font-weight: 600; color: #303133; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 14px; font-weight: 700; color: #303133;
                   border-left: 3px solid #6366f1; padding-left: 10px; margin-bottom: 14px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .summary-card { background: #f5f7fa; border-radius: 8px; padding: 14px 18px; }
  .sc-label { font-size: 11px; color: #909399; margin-bottom: 6px; }
  .sc-value { font-size: 20px; font-weight: 700; line-height: 1.2; }
  .sc-sub   { font-size: 11px; color: #c0c4cc; margin-top: 4px; }
  .income  { color: #1ac44d; }
  .expense { color: #f56c6c; }
  .primary { color: #6366f1; }
  .muted   { color: #909399; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f7fa; font-weight: 600; color: #606266; font-size: 12px;
       padding: 9px 12px; text-align: left; border-bottom: 1px solid #ebeef5; }
  td { padding: 8px 12px; border-bottom: 1px solid #f5f7fa; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .r { text-align: right; }
  .center { text-align: center; }
  .mono { font-family: 'SFMono-Regular', Consolas, monospace; }
  .key-col { color: #606266; letter-spacing: 0.5px; }
  .model-cell { color: #5b5bd6; font-weight: 500; }
  .empty-row { text-align: center; color: #c0c4cc; padding: 20px; }
  .page-footer { margin-top: 48px; border-top: 1px solid #ebeef5; padding-top: 14px;
                 text-align: center; font-size: 11px; color: #c0c4cc; }
  @media print { body { padding: 24px 32px; } }
</style>
</head>
<body>

<div class="page-header">
  <div>
    <div class="doc-title">月度账单</div>
    <div class="doc-period">账单周期：${month}</div>
  </div>
  <div class="meta-area">
    <div><span class="meta-label">生成日期　</span>${new Date(row.generated_at * 1000).toLocaleDateString('zh-CN')}</div>
    <div><span class="meta-label">生成时间　</span>${new Date(row.generated_at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</div>
    <div><span class="meta-label">积分单位　</span>${symbol}</div>
  </div>
</div>

<div class="user-bar">
  <div>
    <div class="uf-label">用户姓名</div>
    <div class="uf-value">${userName}</div>
  </div>
  <div>
    <div class="uf-label">账号</div>
    <div class="uf-value">${userAccount}</div>
  </div>
  ${companyName ? `<div><div class="uf-label">企业名称</div><div class="uf-value">${companyName}</div></div>` : ''}
</div>

<div class="section">
  <div class="section-title">一、积分摘要</div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="sc-label">上月结余 (${symbol})</div>
      <div class="sc-value muted">${qToNum(row.opening_quota)}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">本月充值 (${symbol})</div>
      <div class="sc-value income">${row.topup_total > 0 ? '+' + qToNum(row.topup_total) : '—'}</div>
      ${row.topup_total > 0 ? `<div class="sc-sub">购买 ${qToNum(row.topup_purchase)} · 赠送 ${qToNum(row.topup_gift)}</div>` : ''}
    </div>
    <div class="summary-card">
      <div class="sc-label">本月消费 (${symbol})</div>
      <div class="sc-value expense">${qToNum(row.used_quota)}</div>
    </div>
    <div class="summary-card">
      <div class="sc-label">本月结余 (${symbol})</div>
      <div class="sc-value primary">${qToNum(row.closing_quota)}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">二、本月充值明细</div>
  <table>
    <thead>
      <tr>
        <th style="width:165px">时间</th>
        <th style="width:150px">兑换码</th>
        <th>名称</th>
        <th class="r" style="width:120px">积分 (${symbol})</th>
        <th class="center" style="width:90px">来源</th>
      </tr>
    </thead>
    <tbody>${topupDetailRows}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">三、模型消费明细</div>
  <table>
    <thead>
      <tr>
        <th>模型</th>
        <th class="r" style="width:80px">调用次数</th>
        <th class="r" style="width:110px">输入 tokens</th>
        <th class="r" style="width:110px">输出 tokens</th>
        <th class="r" style="width:110px">花费 (${symbol})</th>
      </tr>
    </thead>
    <tbody>${breakdownRows}</tbody>
  </table>
</div>

<div class="page-footer">本账单由系统自动生成 · 数据仅供参考，以实际结算为准 · 如有疑问请联系客服</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=800');
  if (!win) { Toast.warning('请允许弹出窗口后重试'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────
const BillingPage = () => {
  const { t }    = useTranslation();
  const isMobile = useIsMobile();
  const admin    = isAdmin();

  const [records,     setRecords]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState({});   // rowId -> bool
  const [usernameMap, setUsernameMap] = useState({});
  const [formApi,     setFormApi]     = useState(null);

  const { symbol } = getCurrencyInfo();

  const loadUsers = useCallback(async () => {
    if (!admin) return;
    try {
      const res = await API.get('/api/user/?p=1&page_size=500');
      if (res.data?.success) {
        const users = Array.isArray(res.data.data)
          ? res.data.data
          : res.data.data?.items ?? [];
        const map = {};
        users.forEach((u) => { map[u.id] = u.username || u.display_name || String(u.id); });
        setUsernameMap(map);
      }
    } catch {}
  }, [admin]);

  const load = useCallback(
    async (uid) => {
      setLoading(true);
      try {
        const url = admin
          ? `/api/billing/${uid ? `?user_id=${uid}` : ''}`
          : '/api/billing/self';
        const res = await API.get(url);
        const { success, message, data } = res.data;
        if (!success) { showError(message); return; }

        let items = Array.isArray(data) ? data : data?.items ?? [];
        if (admin) {
          const fv = formApi?.getValues() ?? {};
          const nameFilter = (fv.username || '').trim().toLowerCase();
          if (nameFilter) {
            items = items.filter((r) => {
              const name = (usernameMap[r.user_id] || '').toLowerCase();
              return name.includes(nameFilter) || String(r.user_id).includes(nameFilter);
            });
          }
        }
        setRecords(items.map((r, i) => ({ ...r, __rk: r.id ?? i })));
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [admin, formApi, usernameMap],
  );

  useEffect(() => { loadUsers().then(() => load('')); }, []);
  useEffect(() => { if (admin && Object.keys(usernameMap).length > 0) load(''); }, [usernameMap]);

  const handleDownloadPdf = useCallback(async (row) => {
    setPdfLoading(prev => ({ ...prev, [row.__rk]: true }));
    try {
      await generatePdf(row, usernameMap, t);
    } finally {
      setPdfLoading(prev => ({ ...prev, [row.__rk]: false }));
    }
  }, [usernameMap, t]);

  const expandRowRender = (record) => {
    const items = parseBreakdown(record.model_breakdown);
    if (!items.length) return <Text type='tertiary' style={{ padding: 8 }}>{t('暂无模型明细')}</Text>;
    return (
      <div style={{ padding: '8px 16px' }}>
        <Table
          columns={[
            { title: t('模型'), dataIndex: 'model', render: (v) => <Tag color='violet' size='small'>{v}</Tag> },
            { title: t('调用次数'), dataIndex: 'calls', align: 'right', width: 90, render: (v) => v?.toLocaleString() },
            { title: t('输入 tokens'), dataIndex: 'promptTokens', align: 'right', width: 110, render: (v) => v?.toLocaleString() },
            { title: t('输出 tokens'), dataIndex: 'completionTokens', align: 'right', width: 110, render: (v) => v?.toLocaleString() },
            { title: `${t('花费')} (${symbol})`, dataIndex: 'quota', align: 'right', width: 110,
              render: (v) => <Text style={{ color: 'var(--semi-color-danger)' }}>{qToNum(v)}</Text> },
          ]}
          dataSource={items.map((r, i) => ({ ...r, key: i }))}
          rowKey='key'
          size='small'
          pagination={false}
        />
      </div>
    );
  };

  const columns = [
    {
      title: t('月份'), dataIndex: 'year', width: 100,
      render: (_, row) => (
        <Text strong style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {monthStr(row.year, row.month)}
        </Text>
      ),
    },
    ...(admin ? [{
      title: t('用户名称'), dataIndex: 'user_id', width: 120,
      render: (v) => <Text>{usernameMap[v] || String(v)}</Text>,
    }] : []),
    {
      title: `${t('上月结余')} (${symbol})`, dataIndex: 'opening_quota', align: 'right', width: 140,
      render: (v) => <Text className='font-mono text-xs' style={{ color: 'var(--semi-color-text-2)' }}>{qToNum(v)}</Text>,
    },
    {
      title: `${t('本月充值')} (${symbol})`, dataIndex: 'topup_total', align: 'right', width: 180,
      render: (v, row) => v > 0 ? (
        <div style={{ textAlign: 'right' }}>
          <Text style={{ color: 'var(--semi-color-success)', fontWeight: 600 }}>+{qToNum(v)}</Text>
          {(row.topup_purchase > 0 || row.topup_gift > 0) && (
            <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)', marginTop: 2 }}>
              {row.topup_purchase > 0 && <span style={{ marginRight: 4 }}>{t('购买')} {qToNum(row.topup_purchase)}</span>}
              {row.topup_gift > 0 && <span>{t('赠送')} {qToNum(row.topup_gift)}</span>}
            </div>
          )}
        </div>
      ) : <Text type='tertiary'>—</Text>,
    },
    {
      title: `${t('本月消费')} (${symbol})`, dataIndex: 'used_quota', align: 'right', width: 140,
      render: (v) => (
        <Text className='font-mono text-xs' style={{ color: v > 0 ? 'var(--semi-color-danger)' : undefined }}>
          {qToNum(v)}
        </Text>
      ),
    },
    {
      title: `${t('本月结余')} (${symbol})`, dataIndex: 'closing_quota', align: 'right', width: 140,
      render: (v) => <Text strong style={{ color: 'var(--semi-color-primary)', fontFamily: 'monospace' }}>{qToNum(v)}</Text>,
    },
    {
      title: t('生成时间'), dataIndex: 'generated_at', align: 'right', width: 160,
      render: (v) => <Text className='font-mono text-xs' style={{ color: 'var(--semi-color-text-3)' }}>{formatTs(v)}</Text>,
    },
    {
      title: t('操作'), dataIndex: '__rk', width: 80, align: 'center',
      render: (_, row) => (
        <Button
          icon={<IconDownload />}
          size='small'
          type='tertiary'
          loading={!!pdfLoading[row.__rk]}
          onClick={(e) => { e.stopPropagation(); handleDownloadPdf(row); }}
        >
          PDF
        </Button>
      ),
    },
  ];

  const filtersArea = admin ? (
    <Form
      getFormApi={(api) => setFormApi(api)}
      onSubmit={() => load('')}
      allowEmpty autoComplete='off' layout='vertical' stopValidateWithError={false}
    >
      <div className='flex flex-col gap-2'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
          <Form.Input field='username' prefix={<IconSearch />} placeholder={t('用户名称')} showClear pure size='small' />
        </div>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3'>
          <div />
          <div className='flex gap-2 w-full sm:w-auto justify-end'>
            <Button type='tertiary' htmlType='submit' loading={loading} size='small'>{t('查询')}</Button>
            <Button type='tertiary' size='small' onClick={() => { formApi?.reset(); setTimeout(() => load(''), 50); }}>{t('重置')}</Button>
          </div>
        </div>
      </div>
    </Form>
  ) : null;

  return (
    <div className='mt-[60px] px-2' style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardPro type='type2' searchArea={filtersArea} t={t}>
        <Table
          columns={columns}
          dataSource={records}
          rowKey='__rk'
          loading={loading}
          size='small'
          pagination={false}
          expandedRowRender={expandRowRender}
          expandRowByClick
          rowExpandable={(r) => parseBreakdown(r.model_breakdown).length > 0}
          empty={
            <Empty
              image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
              darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
              description={t('暂无账单')}
              style={{ padding: 30 }}
            />
          }
        />
      </CardPro>
    </div>
  );
};

export default BillingPage;
