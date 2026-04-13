import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Tag,
  Button,
  Form,
  DatePicker,
  Empty,
  Typography,
  Card,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
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

// ─── Quota 换算（纯数字，不含符号） ──────────────────────────────────────────
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

function qToNum(quota) {
  const { displayType, quotaPerUnit, rate } = getCurrencyInfo();
  if (displayType === 'TOKENS') return quota.toLocaleString();
  const usd = quota / quotaPerUnit;
  const val = displayType === 'USD' ? usd : usd * rate;
  const decimals = val >= 100 ? 0 : val >= 1 ? 2 : 4;
  return val.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}

function quotaColHeader(t) {
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
  const usedQ       = Math.max(0, totalTopupQ - currentQuota);
  const currentPurchaseQ =
    usedQ <= totalGiftQ ? totalPurchaseQ : Math.max(0, totalTopupQ - usedQ);
  const currentGiftQ = Math.max(0, currentQuota - currentPurchaseQ);

  const { symbol } = getCurrencyInfo();

  const divStyle = {
    width: 1, height: 48, background: 'var(--semi-color-border)',
    flexShrink: 0, margin: '0 28px',
  };
  const StatItem = ({ label, mainVal, mainColor, sub }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: mainColor || 'var(--semi-color-text-0)', lineHeight: 1.2 }}>
        {mainVal}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--semi-color-text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <StatItem
          label={`${t('当前积分')} (${symbol})`}
          mainVal={qToNum(currentQuota)}
          mainColor='var(--semi-color-primary)'
          sub={`${t('购买')} ${qToNum(currentPurchaseQ)} · ${t('赠送')} ${qToNum(currentGiftQ)}`}
        />
        <div style={divStyle} />
        <StatItem
          label={`${t('已用积分')} (${symbol})`}
          mainVal={qToNum(usedQ)}
          mainColor='var(--semi-color-danger)'
        />
        <div style={divStyle} />
        <StatItem
          label={`${t('总积分')} (${symbol})`}
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

  const [records,      setRecords]      = useState([]);
  const [allRecords,   setAllRecords]   = useState([]);
  const [currentQuota, setCurrentQuota] = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [activePage,   setActivePage]   = useState(1);
  const [pageSize,     setPageSize]     = useState(PAGE_SIZE);
  const [total,        setTotal]        = useState(0);
  const [usernameMap,  setUsernameMap]  = useState({});   // id -> username
  const [formApi,      setFormApi]      = useState(null);

  // 加载用户列表（admin）
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

  // 加载当前用户 quota（统计卡片）
  const loadUserQuota = useCallback(async () => {
    if (admin) return;
    try {
      const res = await API.get('/api/user/self');
      if (res.data?.success) setCurrentQuota(res.data.data?.quota ?? 0);
    } catch {}
  }, [admin]);

  // 加载全量记录（统计卡片用）
  const loadAllForStats = useCallback(async () => {
    if (admin) return;
    try {
      const res = await API.get('/api/redemption/self?p=1&page_size=500');
      if (res.data?.success) {
        const data  = res.data.data;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setAllRecords(items);
        setTotal(Array.isArray(data) ? items.length : data?.total ?? items.length);
      }
    } catch {}
  }, [admin]);

  const load = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      try {
        const base   = admin ? '/api/redemption/' : '/api/redemption/self';
        const params = new URLSearchParams({ p: page, page_size: size });
        const res    = await API.get(`${base}?${params}`);
        const { success, message, data } = res.data;
        if (!success) { showError(message); return; }

        let items = Array.isArray(data) ? data : data?.items ?? [];
        const tot = Array.isArray(data) ? items.length : data?.total ?? items.length;

        if (admin) {
          // 仅已兑换的
          items = items.filter((r) => r.redeemed_time > 0);

          // 客户端用户名过滤
          const fv = formApi?.getValues() ?? {};
          const usernameFilter = (fv.username || '').trim().toLowerCase();
          if (usernameFilter) {
            items = items.filter((r) => {
              const name = (usernameMap[r.used_user_id] || '').toLowerCase();
              return name.includes(usernameFilter) || String(r.used_user_id).includes(usernameFilter);
            });
          }
        }

        // 日期范围过滤
        const fv = formApi?.getValues() ?? {};
        if (fv.dateRange?.[0] && fv.dateRange?.[1]) {
          const start = fv.dateRange[0].getTime() / 1000;
          const end   = fv.dateRange[1].getTime() / 1000;
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
    [admin, formApi, pageSize, usernameMap],
  );

  useEffect(() => {
    loadUsers().then(() => load(1, PAGE_SIZE));
    loadAllForStats();
    loadUserQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // usernameMap 加载完成后重新渲染 admin 表格
  useEffect(() => {
    if (admin && Object.keys(usernameMap).length > 0) load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameMap]);

  const colHeader = quotaColHeader(t);

  const columns = [
    {
      title: t('时间'),
      dataIndex: 'redeemed_time',
      width: 160,
      render: (v) => (
        <Text className='font-mono text-xs' style={{ color: 'var(--semi-color-text-2)' }}>
          {formatTs(v)}
        </Text>
      ),
    },
    ...(admin
      ? [{
          title: t('用户名称'),
          dataIndex: 'used_user_id',
          width: 120,
          render: (v) => (
            <Text>{usernameMap[v] || String(v)}</Text>
          ),
        }]
      : []),
    {
      title: t('兑换码'),
      dataIndex: 'key',
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text
            className='font-mono'
            style={{ fontSize: 12, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}
          >
            {v}
          </Text>
          <Text copyable={{ content: v }} style={{ fontSize: 0 }}>{' '}</Text>
        </div>
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
        <Tag size='small' color={!v || v === 0 ? 'green' : 'orange'}>
          {formatExpiry(v)}
        </Tag>
      ),
    },
  ];

  const filtersArea = (
    <Form
      getFormApi={(api) => setFormApi(api)}
      onSubmit={() => load(1, pageSize)}
      allowEmpty
      autoComplete='off'
      layout='vertical'
      trigger='change'
      stopValidateWithError={false}
    >
      <div className='flex flex-col gap-2'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
          <div className='col-span-1 lg:col-span-2'>
            <Form.DatePicker
              field='dateRange'
              className='w-full'
              type='dateTimeRange'
              placeholder={[t('开始时间'), t('结束时间')]}
              showClear
              pure
              size='small'
              presets={DATE_RANGE_PRESETS.map((p) => ({
                text: t(p.text),
                start: p.start(),
                end: p.end(),
              }))}
            />
          </div>
          {admin && (
            <Form.Input
              field='username'
              prefix={<IconSearch />}
              placeholder={t('用户名称')}
              showClear
              pure
              size='small'
            />
          )}
        </div>

        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3'>
          <div />
          <div className='flex gap-2 w-full sm:w-auto justify-end'>
            <Button type='tertiary' htmlType='submit' loading={loading} size='small'>
              {t('查询')}
            </Button>
            <Button
              type='tertiary'
              size='small'
              onClick={() => {
                formApi?.reset();
                setTimeout(() => load(1, pageSize), 50);
              }}
            >
              {t('重置')}
            </Button>
          </div>
        </div>
      </div>
    </Form>
  );

  return (
    <div className='mt-[60px] px-2 mx-auto' style={{ maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!admin && (
        <StatsCard allRecords={allRecords} currentQuota={currentQuota} t={t} />
      )}

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
          scroll={{ x: 'max-content' }}
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
