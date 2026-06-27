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
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf/dist/jspdf.es.js';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { API, showError } from '../../helpers';
import { isAdmin } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

// ─── Quota 换算（纯数字，不含符号） ──────────────────────────────────────────
function getCurrencyInfo() {
  const fixedQuotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '500000');
  return { quotaPerUnit: fixedQuotaPerUnit, symbol: '$' };
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
  const { quotaPerUnit: billingQuotaPerUnit } = getCurrencyInfo();
  const usdValue = quota / billingQuotaPerUnit;
  return usdValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
function sanitizeFileNamePart(value) {
  return String(value || 'user')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim() || 'user';
}

function buildBillingPdfFileName(row, userAccount) {
  return `月度账单-${row.year}年${row.month}月-${sanitizeFileNamePart(userAccount)}.pdf`;
}

const PDF_PAGE_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PDF_PAGE_PADDING_X = 56;
const PDF_PAGE_PADDING_TOP_FIRST = 48;
const PDF_PAGE_PADDING_TOP_CONTINUED = 74;
const PDF_PAGE_PADDING_BOTTOM = 42;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createHtmlNode(doc, html) {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function buildBillingPdfMarkup({
  row,
  userName,
  userAccount,
  companyName,
  symbol,
  month,
  topupRows,
  breakdownRows,
}) {
  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .billing-pdf-root {
      width: ${PDF_PAGE_WIDTH_PX}px;
      background: #f4f6fb;
    }
    .billing-pdf-page {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif;
      color: #303133;
      background: #fff;
      width: ${PDF_PAGE_WIDTH_PX}px;
      height: ${PDF_PAGE_HEIGHT_PX}px;
      padding: ${PDF_PAGE_PADDING_TOP_FIRST}px ${PDF_PAGE_PADDING_X}px ${PDF_PAGE_PADDING_BOTTOM}px;
      font-size: 13px;
      display: flex;
      flex-direction: column;
    }
    .billing-pdf-page--continued {
      padding-top: ${PDF_PAGE_PADDING_TOP_CONTINUED}px;
    }
    .billing-pdf-page + .billing-pdf-page {
      margin-top: 24px;
    }
    .page-content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 28px; }
    .doc-title  { font-size: 22px; font-weight: 700; color: #1a1a2e; }
    .doc-period { font-size: 13px; color: #6366f1; margin-top: 4px; font-weight: 600; }
    .meta-area  { text-align: right; line-height: 1.9; color: #606266; }
    .meta-label { color: #909399; font-size: 11px; }
    .user-bar { background: #f5f7fa; border-radius: 8px; padding: 14px 20px; display: flex; gap: 40px; margin-bottom: 28px; flex-wrap: wrap; }
    .uf-label { font-size: 11px; color: #909399; margin-bottom: 2px; }
    .uf-value { font-size: 13px; font-weight: 600; color: #303133; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 14px; font-weight: 700; color: #303133; border-left: 3px solid #6366f1; padding-left: 10px; margin-bottom: 14px; }
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
    th { background: #f5f7fa; font-weight: 600; color: #606266; font-size: 12px; padding: 9px 12px; text-align: left; border-bottom: 1px solid #ebeef5; }
    td { padding: 8px 12px; border-bottom: 1px solid #f5f7fa; font-size: 12px; }
    tr:last-child td { border-bottom: none; }
    .r { text-align: right; }
    .center { text-align: center; }
    .mono { font-family: 'SFMono-Regular', Consolas, monospace; }
    .key-col { color: #606266; letter-spacing: 0.5px; }
    .model-cell { color: #5b5bd6; font-weight: 500; }
    .empty-row { text-align: center; color: #c0c4cc; padding: 20px; }
    .page-footer { margin-top: 30px; border-top: 1px solid #ebeef5; padding-top: 10px; text-align: center; font-size: 11px; color: #c0c4cc; }
  `;

  const headerHtml = `
    <div class="page-header">
      <div>
        <div class="doc-title">月度账单</div>
        <div class="doc-period">账单周期：${escapeHtml(month)}</div>
      </div>
      <div class="meta-area">
        <div><span class="meta-label">生成日期　</span>${escapeHtml(new Date(row.generated_at * 1000).toLocaleDateString('zh-CN'))}</div>
        <div><span class="meta-label">生成时间　</span>${escapeHtml(new Date(row.generated_at * 1000).toLocaleTimeString('zh-CN', { hour12: false }))}</div>
        <div><span class="meta-label">金额单位　</span>${escapeHtml(symbol)}</div>
      </div>
    </div>
  `;

  const userBarHtml = `
    <div class="user-bar">
      <div>
        <div class="uf-label">用户姓名</div>
        <div class="uf-value">${escapeHtml(userName)}</div>
      </div>
      <div>
        <div class="uf-label">账号</div>
        <div class="uf-value">${escapeHtml(userAccount)}</div>
      </div>
      ${companyName ? `<div><div class="uf-label">企业名称</div><div class="uf-value">${escapeHtml(companyName)}</div></div>` : ''}
    </div>
  `;

  const summaryHtml = `
    <div class="section">
      <div class="section-title">一、账单摘要</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="sc-label">上月结余 (${escapeHtml(symbol)})</div>
          <div class="sc-value muted">${escapeHtml(qToNum(row.opening_quota))}</div>
        </div>
        <div class="summary-card">
          <div class="sc-label">本月充值 (${escapeHtml(symbol)})</div>
          <div class="sc-value income">${row.topup_total > 0 ? '+' + escapeHtml(qToNum(row.topup_total)) : '—'}</div>
          ${row.topup_total > 0 ? `<div class="sc-sub">购买 ${escapeHtml(qToNum(row.topup_purchase))} · 赠送 ${escapeHtml(qToNum(row.topup_gift))}</div>` : ''}
        </div>
        <div class="summary-card">
          <div class="sc-label">本月消费 (${escapeHtml(symbol)})</div>
          <div class="sc-value expense">${escapeHtml(qToNum(row.used_quota))}</div>
        </div>
        <div class="summary-card">
          <div class="sc-label">本月结余 (${escapeHtml(symbol)})</div>
          <div class="sc-value primary">${escapeHtml(qToNum(row.closing_quota))}</div>
        </div>
      </div>
    </div>
  `;

  const tableSections = [
    {
      title: '二、本月充值明细',
      emptyText: '本月暂无充值记录',
      columns: [
        { label: '时间', width: '165px' },
        { label: '兑换码', width: '150px' },
        { label: '名称' },
        { label: `金额 (${symbol})`, width: '120px', className: 'r' },
        { label: '来源', width: '90px', className: 'center' },
      ],
      rows: topupRows,
    },
    {
      title: '三、模型消费明细',
      emptyText: '暂无模型消费明细',
      columns: [
        { label: '模型' },
        { label: '调用次数', width: '80px', className: 'r' },
        { label: '输入 tokens', width: '110px', className: 'r' },
        { label: '输出 tokens', width: '110px', className: 'r' },
        { label: `花费 (${symbol})`, width: '110px', className: 'r' },
      ],
      rows: breakdownRows,
    },
  ];

  return {
    styles,
    headerHtml,
    userBarHtml,
    summaryHtml,
    tableSections,
  };
}

function createBillingPdfPage(doc, isFirstPage) {
  const page = createHtmlNode(
    doc,
    `<div class="billing-pdf-page${isFirstPage ? '' : ' billing-pdf-page--continued'}">
      <div class="page-content"></div>
      <div class="page-footer">CUTOS.AI</div>
    </div>`,
  );
  return {
    element: page,
    content: page.querySelector('.page-content'),
  };
}

function isContentOverflowing(page) {
  return page.content.scrollHeight > page.content.clientHeight + 1;
}

function createTableChunk(doc, section, showTitle) {
  const wrapper = createHtmlNode(doc, '<div class="section"></div>');
  if (showTitle) {
    wrapper.appendChild(createHtmlNode(doc, `<div class="section-title">${escapeHtml(section.title)}</div>`));
  }

  const table = createHtmlNode(doc, '<table><thead><tr></tr></thead><tbody></tbody></table>');
  const headerRow = table.querySelector('thead tr');
  section.columns.forEach((column) => {
    const th = doc.createElement('th');
    th.textContent = column.label;
    if (column.width) {
      th.style.width = column.width;
    }
    if (column.className) {
      th.className = column.className;
    }
    headerRow.appendChild(th);
  });
  wrapper.appendChild(table);

  return {
    wrapper,
    tbody: table.querySelector('tbody'),
  };
}

function createTableRow(doc, row, columnCount) {
  if (row?.empty) {
    return createHtmlNode(
      doc,
      `<tr><td colspan="${columnCount}" class="empty-row">${escapeHtml(row.text)}</td></tr>`,
    );
  }

  const tr = doc.createElement('tr');
  (row?.cells || []).forEach((cell) => {
    const td = doc.createElement('td');
    td.textContent = cell.text ?? '';
    if (cell.className) {
      td.className = cell.className;
    }
    tr.appendChild(td);
  });
  return tr;
}

function buildBillingPdfPages({
  doc,
  root,
  headerHtml,
  userBarHtml,
  summaryHtml,
  tableSections,
}) {
  const pages = [];
  const createPage = (isFirstPage = false) => {
    const page = createBillingPdfPage(doc, isFirstPage);
    root.appendChild(page.element);
    pages.push(page);
    return page;
  };

  const firstPage = createPage(true);
  firstPage.content.appendChild(createHtmlNode(doc, headerHtml));
  firstPage.content.appendChild(createHtmlNode(doc, userBarHtml));
  firstPage.content.appendChild(createHtmlNode(doc, summaryHtml));

  tableSections.forEach((section) => {
    const rows = section.rows?.length ? section.rows : [{ empty: true, text: section.emptyText }];
    let page = pages[pages.length - 1];
    let chunk = createTableChunk(doc, section, true);
    page.content.appendChild(chunk.wrapper);

    if (isContentOverflowing(page)) {
      page.content.removeChild(chunk.wrapper);
      page = createPage(false);
      chunk = createTableChunk(doc, section, true);
      page.content.appendChild(chunk.wrapper);
    }

    let hasRenderedRows = false;

    rows.forEach((row) => {
      const rowNode = createTableRow(doc, row, section.columns.length);
      chunk.tbody.appendChild(rowNode);

      if (!isContentOverflowing(page)) {
        hasRenderedRows = true;
        return;
      }

      chunk.tbody.removeChild(rowNode);
      const needsTitle = !hasRenderedRows;
      const hasRowsOnCurrentPage = chunk.tbody.children.length > 0;
      if (!hasRowsOnCurrentPage) {
        page.content.removeChild(chunk.wrapper);
      }

      page = createPage(false);
      chunk = createTableChunk(doc, section, needsTitle);
      page.content.appendChild(chunk.wrapper);
      chunk.tbody.appendChild(rowNode);

      hasRenderedRows = true;
    });
  });

  return pages;
}

async function downloadBillingPdf({
  fileName,
  styles,
  headerHtml,
  userBarHtml,
  summaryHtml,
  tableSections,
}) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${PDF_PAGE_WIDTH_PX}px`;
  container.style.background = '#ffffff';
  container.style.zIndex = '-1';
  container.innerHTML = `<style>${styles}</style><div class="billing-pdf-root"></div>`;
  document.body.appendChild(container);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const root = container.querySelector('.billing-pdf-root');
    const pages = buildBillingPdfPages({
      doc: document,
      root,
      headerHtml,
      userBarHtml,
      summaryHtml,
      tableSections,
    });

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const pdf = new jsPDF('p', 'mm', 'a4');
    for (let i = 0; i < pages.length; i += 1) {
      const canvas = await html2canvas(pages[i].element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
    }

    pdf.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
}

async function generatePdf(row, userInfoMap, t) {
  const { symbol } = getCurrencyInfo();
  const month = `${row.year}年${row.month}月`;

  let userName = '—', userAccount = '—', companyName = '';
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    userName = stored.display_name || stored.username || '—';
    userAccount = stored.username || '—';
    companyName = stored.display_name || '';
  } catch {}

  if (isAdmin() && row.user_id) {
    const mapped = userInfoMap[row.user_id];
    if (mapped) {
      userName = mapped.displayName || mapped.username || String(row.user_id);
      userAccount = mapped.username || String(row.user_id);
      companyName = mapped.displayName || '';
    }
  }

  let topupRows = [];
  try {
    const mStart = new Date(row.year, row.month - 1, 1).getTime() / 1000;
    const mEnd = new Date(row.year, row.month, 1).getTime() / 1000;
    const uid = isAdmin() && row.user_id ? row.user_id : null;
    const url = uid
      ? `/api/redemption/?p=1&page_size=500&used_user_id=${uid}`
      : '/api/redemption/self?p=1&page_size=500';
    const res = await API.get(url);
    if (res.data?.success) {
      const data = res.data.data;
      const items = Array.isArray(data) ? data : data?.items ?? [];
      topupRows = items.filter(
        (r) => r.redeemed_time >= mStart && r.redeemed_time < mEnd,
      );
    }
  } catch {}

  const breakdown = parseBreakdown(row.model_breakdown);
  const breakdownDetailRows = breakdown.map((r) => ({
    cells: [
      { text: r.model || '—', className: 'model-cell' },
      { text: (r.calls || 0).toLocaleString(), className: 'r' },
      { text: (r.promptTokens || 0).toLocaleString(), className: 'r' },
      { text: (r.completionTokens || 0).toLocaleString(), className: 'r' },
      { text: qToNum(r.quota || 0), className: 'r expense mono' },
    ],
  }));

  const topupDetailRows = topupRows.map((r) => ({
    cells: [
      { text: new Date(r.redeemed_time * 1000).toLocaleString('zh-CN', { hour12: false }), className: 'mono' },
      { text: maskKey(r.key), className: 'mono key-col' },
      { text: r.name || '—' },
      { text: qToNum(r.quota || 0), className: 'r income mono' },
      { text: SOURCE_LABEL[r.cc_source] ?? '未知', className: 'center' },
    ],
  }));

  const pdfMarkup = buildBillingPdfMarkup({
    row,
    userName,
    userAccount,
    companyName,
    symbol,
    month,
    topupRows: topupDetailRows,
    breakdownRows: breakdownDetailRows,
  });

  await downloadBillingPdf({
    fileName: buildBillingPdfFileName(row, userAccount),
    ...pdfMarkup,
  });
  Toast.success(t('PDF 已下载'));
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────
const BillingPage = () => {
  const { t }    = useTranslation();
  const isMobile = useIsMobile();
  const admin    = isAdmin();

  const [records,     setRecords]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState({});   // rowId -> bool
  const [userInfoMap, setUserInfoMap] = useState({});
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
        users.forEach((u) => {
          map[u.id] = {
            username: u.username || String(u.id),
            displayName: u.display_name || '',
            label: u.username || u.display_name || String(u.id),
          };
        });
        setUserInfoMap(map);
      }
    } catch {}
  }, [admin]);

  const resolveBillingUserId = useCallback((keyword) => {
    const normalizedKeyword = (keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) {
      return '';
    }

    const exactMatches = Object.entries(userInfoMap).filter(([id, info]) => {
      const stringId = String(id);
      const username = (info?.username || '').toLowerCase();
      const displayName = (info?.displayName || '').toLowerCase();
      return (
        stringId === normalizedKeyword ||
        username === normalizedKeyword ||
        displayName === normalizedKeyword
      );
    });

    return exactMatches.length === 1 ? exactMatches[0][0] : '';
  }, [userInfoMap]);

  const load = useCallback(
    async (uid) => {
      setLoading(true);
      try {
        const formValues = formApi?.getValues() ?? {};
        const nameFilter = (formValues.username || '').trim();
        const resolvedUserId = admin
          ? uid || resolveBillingUserId(nameFilter)
          : uid;
        const url = admin
          ? `/api/billing/${resolvedUserId ? `?user_id=${resolvedUserId}` : ''}`
          : '/api/billing/self';
        const res = await API.get(url);
        const { success, message, data } = res.data;
        if (!success) { showError(message); return; }

        let items = Array.isArray(data) ? data : data?.items ?? [];
        if (admin) {
          const loweredNameFilter = nameFilter.toLowerCase();
          if (loweredNameFilter) {
            items = items.filter((r) => {
              const userInfo = userInfoMap[r.user_id] || {};
              const label = (userInfo.label || '').toLowerCase();
              const username = (userInfo.username || '').toLowerCase();
              const displayName = (userInfo.displayName || '').toLowerCase();
              return (
                label.includes(loweredNameFilter) ||
                username.includes(loweredNameFilter) ||
                displayName.includes(loweredNameFilter) ||
                String(r.user_id).includes(loweredNameFilter)
              );
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
    [admin, formApi, resolveBillingUserId, userInfoMap],
  );

  useEffect(() => { loadUsers().then(() => load('')); }, []);
  useEffect(() => { if (admin && Object.keys(userInfoMap).length > 0) load(''); }, [userInfoMap]);

  const handleDownloadPdf = useCallback(async (row) => {
    setPdfLoading(prev => ({ ...prev, [row.__rk]: true }));
    try {
      await generatePdf(row, userInfoMap, t);
    } finally {
      setPdfLoading(prev => ({ ...prev, [row.__rk]: false }));
    }
  }, [userInfoMap, t]);

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
      render: (v) => <Text>{userInfoMap[v]?.label || String(v)}</Text>,
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
