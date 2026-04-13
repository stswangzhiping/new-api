import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Tag,
  Button,
  DatePicker,
  Empty,
  Typography,
  Tooltip,
  Card,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { API, showError } from '../../helpers';
import { isAdmin } from '../../helpers/utils';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { CC_SOURCE_MAP } from '../../constants/redemption.constants';
import { DATE_RANGE_PRESETS } from '../../constants/console.constants';

const { Text } = Typography;
const PAGE_SIZE = 20;

// ─── Quota 换算 ────────────────────────────────────────────────────────────────
function getCurrencyInfo() {
  const displayType = localStorage.getItem('quota_display_type') || 'USD';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '500000');
  let symbol = '$';
  let rate = 1;
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

/** quota → 纯数字字符串（不含符号），用于表格值和统计数字 */
function qToNum(quota) {
  const { displayType, quotaPerUnit, rate } = getCurrencyInfo();
  if (displayType === 'TOKENS') return quota.toLocaleString();
  const usd = quota / quotaPerUnit;
  const val = displayType === 'USD' ? usd : usd * rate;
  // 较小数字保留2位，大数字不保留小数
  const decimals = val >= 100 ? 0 : val >= 1 ? 2 : 4;
  return val.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}

/** 列标题用的符号，e.g. "积分 (✦)" or "费用 ($)" */
function headerLabel(t) {
  const { displayType, symbol } = getCurrencyInfo();
  if (displayType === 'TOKENS') return t('Tokens');
  return `${t('积分')} (${symbol})`;
}

// ─── 格式化 ────────────────────────────────────────────────────────────────────
function formatTs(ts) {
  if (!ts || ts <= 0) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function formatExpiry(ts) {
  if (!ts || ts <= 0) return '永久有效';
  return new Date(ts * 1000).toLocaleDateString('zh-CN');
}

function SourceTag({ src }) {
  const { t } = useTranslation();
  const info = CC_SOURCE_MAP?.[src];
  if (!info) return <Tag size='small'>{t('未知')}</Tag>;
  return <Tag color={info.color} size='small'>{t(info.text)}</Tag>;
}

// ─── 统计卡片 ──────────────────────────────────────────────────────────────────
function StatsCard({ allRecords, currentQuota, t }) {
  const totalPurchaseQ = useMemo(
    () => allRecords.filter((r) => r.cc_source === 2).reduce((s, r) => s + r.quota, 0),
    [allRecords],
  );
  const totalGiftQ = useMemo(
    () => allRecords.filter((r) => r.cc_source !== 2).reduce((s, r) => s + r.quota, 0),
    [allRecords],
  );
  const totalTopupQ = totalPurchaseQ + totalGiftQ;
  const usedQ = Math.max(0, totalTopupQ - currentQuota);

  // 赠送优先消费
  const currentPurchaseQ =
    usedQ <= totalGiftQ
      ? totalPurchaseQ
      : Math.max(0, totalTopupQ - usedQ);
  const currentGiftQ = Math.max(0, currentQuota - currentPurchaseQ);

  const statStyle = { flex: 1, minWidth: 0 };
  const dividerStyle = {
    width: 1, height: 48, background: 'var(--semi-color-border)',
    flexShrink: 0, margin: '0 28px',
  };

  const StatItem = ({ label, mainVal, mainColor, sub }) => (
    <div style={statStyle}>
      <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: mainColor || 'var(--semi-color-text-0)', lineHeight: 1.2 }}>
        {mainVal}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--semi-color-text-3)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );

  return (
    <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <StatItem
          label={t('当前积分')}
          mainVal={qToNum(currentQuota)}
          mainColor='var(--semi-color-primary)'
          sub={`${t('购买')} ${qToNum(currentPurchaseQ)} · ${t('赠送')} ${qToNum(currentGiftQ)}`}
        />
        <div style={dividerStyle} />
        <StatItem
          label={t('已用积分')}
          mainVal={qToNum(usedQ)}
          mainColor='var(--semi-color-danger)'
        />
        <div style={dividerStyle} />
        <StatItem
          label={t('总积分')}
          mainVal={qToNum(totalTopupQ)}
          sub={`${t('购买')} ${qToNum(totalPurchaseQ)} · ${t('赠送')} ${qToNum(totalGiftQ)}`}
        />
      </div>
    </Card>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────
const TopupHistoryPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const admin = isAdmin();

  const [records, setRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [currentQuota, setCurrentQuota] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState(null);
  const [userIdFilter, setUserIdFilter] = useState('');

  // 加载当前用户 quota（仅普通用户需要统计）
  const loadUserQuota = useCallback(async () => {
    if (admin) return;
    try {
      const res = await API.get('/api/user/self');
      if (res.data?.success) {
        setCurrentQuota(res.data.data?.quota ?? 0);
      }
    } catch {}
  }, [admin]);

  // 加载全量记录用于统计（仅用户）
  const loadAllForStats = useCallback(async () => {
    if (admin) return;
    try {
      const res = await API.get('/api/redemption/self?p=1&page_size=500');
      const { success, data } = res.data;
      if (success) {
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setAllRecords(items);
        setTotal(Array.isArray(data) ? items.length : data?.total ?? items.length);
      }
    } catch {}
  }, [admin]);

  const buildUrl = useCallback(
    (page, size) => {
      const base = admin ? '/api/redemption/' : '/api/redemption/self';
      const params = new URLSearchParams({ p: page, page_size: size });
      return `${base}?${params}`;
    },
    [admin],
  );

  const load = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      try {
        const res = await API.get(buildUrl(page, size));
        const { success, message, data } = res.data;
        if (!success) { showError(message); return; }

        let items = Array.isArray(data) ? data : data?.items ?? [];
        const tot = Array.isArray(data) ? items.length : data?.total ?? items.length;

        if (admin) {
          items = items.filter((r) => r.redeemed_time > 0);
          if (userIdFilter.trim()) {
            items = items.filter((r) =>
              String(r.used_user_id).includes(userIdFilter.trim()),
            );
          }
        }

        if (dateRange?.[0] && dateRange?.[1]) {
          const start = dateRange[0].getTime() / 1000;
          const end   = dateRange[1].getTime() / 1000;
          items = items.filter((r) => r.redeemed_time >= start && r.redeemed_time <= end);
        }

        setRecords(items.map((r, i) => ({ ...r, key: r.id ?? i })));
        setTotal(tot);
        setActivePage(page);
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [admin, buildUrl, dateRange, pageSize, userIdFilter],
  );

  useEffect(() => {
    load(1, pageSize);
    loadAllForStats();
    loadUserQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colHeader = headerLabel(t);

  const columns = [
    {
      title: t('时间'),
      dataIndex: 'redeemed_time',
      width: 170,
      render: (v) => (
        <Text className='font-mono text-xs text-[var(--semi-color-text-2)]'>
          {formatTs(v)}
        </Text>
      ),
    },
    ...(admin
      ? [{ title: t('用户 ID'), dataIndex: 'used_user_id', width: 90 }]
      : []),
    {
      title: t('兑换码'),
      dataIndex: 'key',
      render: (v) => (
        <Text
          className='font-mono text-xs'
          copyable={{ content: v }}
          ellipsis={{ showTooltip: true }}
          style={{ maxWidth: 220 }}
        >
          {v}
        </Text>
      ),
    },
    {
      title: t('名称'),
      dataIndex: 'name',
      render: (v) => <Text>{v || '—'}</Text>,
    },
    {
      title: colHeader,
      dataIndex: 'quota',
      align: 'right',
      width: 120,
      render: (v) => (
        <Text style={{ fontWeight: 600, color: 'var(--semi-color-success)' }}>
          {qToNum(v)}
        </Text>
      ),
    },
    {
      title: t('来源'),
      dataIndex: 'cc_source',
      width: 100,
      render: (v) => <SourceTag src={v} />,
    },
    {
      title: t('有效期'),
      dataIndex: 'expired_time',
      width: 120,
      render: (v) => (
        <Tooltip content={v > 0 ? formatTs(v) : ''} disabled={!v || v === 0}>
          <Tag size='small' color={!v || v === 0 ? 'green' : 'orange'}>
            {formatExpiry(v)}
          </Tag>
        </Tooltip>
      ),
    },
  ];

  const filtersArea = (
    <div className='flex flex-wrap gap-2 items-end'>
      <DatePicker
        type='dateTimeRange'
        placeholder={[t('开始时间'), t('结束时间')]}
        showClear
        size='small'
        value={dateRange}
        onChange={(v) => setDateRange(v)}
        presets={DATE_RANGE_PRESETS.map((p) => ({
          text: t(p.text),
          start: p.start(),
          end: p.end(),
        }))}
        style={{ width: isMobile ? '100%' : 340 }}
      />
      <Button size='small' type='tertiary' onClick={() => load(1, pageSize)} loading={loading}>
        {t('查询')}
      </Button>
      <Button
        size='small'
        type='tertiary'
        onClick={() => { setDateRange(null); setUserIdFilter(''); load(1, pageSize); }}
      >
        {t('重置')}
      </Button>
    </div>
  );

  return (
    <div className='mt-[60px] px-2' style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 统计卡片（仅普通用户显示） */}
      {!admin && (
        <StatsCard allRecords={allRecords} currentQuota={currentQuota} t={t} />
      )}

      {/* 记录表格 */}
      <CardPro
        type='type2'
        searchArea={filtersArea}
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize,
          total,
          onPageChange: (p) => load(p, pageSize),
          onPageSizeChange: (s) => { setPageSize(s); load(1, s); },
          isMobile,
          t,
        })}
        t={t}
      >
        <Table
          columns={columns}
          dataSource={records}
          rowKey='key'
          loading={loading}
          size='small'
          pagination={false}
          scroll={isMobile ? undefined : { x: 'max-content' }}
          empty={
            <Empty
              image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
              darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
              description={t('暂无充值记录')}
              style={{ padding: 30 }}
            />
          }
        />
      </CardPro>
    </div>
  );
};

export default TopupHistoryPage;
