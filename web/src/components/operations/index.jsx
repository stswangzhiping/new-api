import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Typography,
  Button,
  Select,
  Spin,
  Toast,
} from '@douyinfe/semi-ui';
import {
  IconRefresh,
  IconTrendUp,
  IconMoney,
  IconUser,
  IconGift,
  IconSafe,
} from '@douyinfe/semi-icons';
import { API, showError } from '../../helpers';
import { VChart } from '@visactor/react-vchart';

const { Title, Text } = Typography;

// ─── Quota 换算 ──────────────────────────────────────────────────────────────

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

function qToDisplay(quota) {
  const { displayType, quotaPerUnit, rate } = getCurrencyInfo();
  if (!quota) return '0';
  if (displayType === 'TOKENS') return quota.toLocaleString();
  const usd = quota / quotaPerUnit;
  const val = displayType === 'USD' ? usd : usd * rate;
  const decimals = val >= 100 ? 0 : val >= 1 ? 2 : 4;
  return val.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}

// ─── 月份选项生成 ─────────────────────────────────────────────────────────────

function buildMonthOptions(count = 13) {
  const opts = [];
  const now  = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`,
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
    });
  }
  return opts;
}

// ─── KPI 卡片 ─────────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, icon: Icon, color = 'var(--semi-color-primary)', loading }) => (
  <Card className='!rounded-2xl' shadows='hover'>
    <div className='flex items-start justify-between gap-3'>
      <div className='flex-1 min-w-0'>
        <Text type='tertiary' size='small'>{label}</Text>
        {loading ? (
          <div className='mt-2'><Spin size='middle' /></div>
        ) : (
          <div
            className='mt-1 font-bold truncate'
            style={{ fontSize: 22, color, fontFamily: 'monospace' }}
          >
            {value}
          </div>
        )}
        {sub && <Text type='quaternary' size='small' className='mt-1 block'>{sub}</Text>}
      </div>
      {Icon && (
        <div
          className='rounded-xl flex items-center justify-center flex-shrink-0'
          style={{ width: 40, height: 40, background: color + '18' }}
        >
          <Icon size='extra-large' style={{ color }} />
        </div>
      )}
    </div>
  </Card>
);

// ─── 主组件 ──────────────────────────────────────────────────────────────────

const OperationsDashboard = () => {
  const monthOptions = buildMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);

  const { symbol } = getCurrencyInfo();

  const load = useCallback(async (mv) => {
    const opt = monthOptions.find(o => o.value === mv) || monthOptions[0];
    setLoading(true);
    try {
      const res = await API.get(
        `/api/operations/summary?year=${opt.year}&month=${opt.month}`
      );
      if (res.data?.success) {
        setData(res.data.data);
      } else {
        showError(res.data?.message || '加载失败');
      }
    } catch (e) {
      showError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedMonth); }, [selectedMonth]);

  // ─── ECharts-style spec via VChart ─────────────────────────────────────────

  const breakdown = data?.channel_breakdown ?? [];

  const barSpec = {
    type: 'bar',
    data: [{
      id: 'channel',
      values: breakdown.map(r => ({
        channel: r.channel_name || '(未知)',
        quota:   r.quota,
      })),
    }],
    xField:  'channel',
    yField:  'quota',
    bar: { style: { fill: 'var(--semi-color-primary)' } },
    axes: [
      { orient: 'bottom', label: { style: { fill: 'var(--semi-color-text-2)', fontSize: 11 } } },
      { orient: 'left',   label: { style: { fill: 'var(--semi-color-text-2)', fontSize: 11 } } },
    ],
    tooltip: {
      mark: {
        content: [{ key: d => d.channel, value: d => qToDisplay(d.quota) + ' ' + symbol }],
      },
    },
    background: 'transparent',
  };

  const pieSpec = breakdown.length > 0 ? {
    type: 'pie',
    data: [{
      id: 'pie',
      values: breakdown.map(r => ({
        channel: r.channel_name || '(未知)',
        quota:   r.quota,
      })),
    }],
    valueField:    'quota',
    categoryField: 'channel',
    outerRadius: 0.7,
    innerRadius: 0.4,
    label: { style: { fontSize: 11 } },
    background: 'transparent',
  } : null;

  // ─── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div className='flex flex-col gap-4 pb-6'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <Title heading={4} className='!mb-0'>运营中心</Title>
          <Text type='tertiary' size='small'>运营指标总览，仅管理员可见</Text>
        </div>
        <div className='flex items-center gap-2'>
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            style={{ width: 160 }}
            size='small'
            optionList={monthOptions.map(o => ({ value: o.value, label: o.label }))}
          />
          <Button
            size='small'
            type='tertiary'
            icon={<IconRefresh />}
            loading={loading}
            onClick={() => load(selectedMonth)}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* KPI 卡片区 */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
        <KpiCard
          label='已消耗积分'
          value={`${symbol} ${qToDisplay(data?.consumed_quota ?? 0)}`}
          sub='本月用户实际消耗'
          icon={IconTrendUp}
          color='var(--semi-color-danger)'
          loading={loading}
        />
        <KpiCard
          label='充值积分'
          value={`${symbol} ${qToDisplay(data?.topup_quota ?? 0)}`}
          sub='本月兑换码充值'
          icon={IconMoney}
          color='var(--semi-color-success)'
          loading={loading}
        />
        <KpiCard
          label='新增用户'
          value={(data?.new_user_count ?? 0).toLocaleString()}
          sub={`活跃用户 ${(data?.active_user_count ?? 0).toLocaleString()} 人`}
          icon={IconUser}
          color='var(--semi-color-primary)'
          loading={loading}
        />
        <KpiCard
          label='免费发放积分'
          value={`${symbol} ${qToDisplay(data?.gift_quota ?? 0)}`}
          sub='本月系统赠送'
          icon={IconGift}
          color='var(--semi-color-warning)'
          loading={loading}
        />
      </div>

      {/* 图表区 */}
      {breakdown.length > 0 && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
          <Card className='!rounded-2xl' title={
            <Text strong size='small'>渠道消耗分布（柱状图）</Text>
          }>
            <VChart
              spec={barSpec}
              style={{ height: 280 }}
              option={{ animation: false }}
            />
          </Card>
          <Card className='!rounded-2xl' title={
            <Text strong size='small'>渠道消耗占比（饼图）</Text>
          }>
            <VChart
              spec={pieSpec}
              style={{ height: 280 }}
              option={{ animation: false }}
            />
          </Card>
        </div>
      )}

      {/* 余额负债区 */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
        <Card className='!rounded-2xl' shadows='hover'>
          <div className='flex items-start gap-3'>
            <div
              className='rounded-xl flex items-center justify-center flex-shrink-0'
              style={{ width: 40, height: 40, background: 'var(--semi-color-primary)18' }}
            >
              <IconSafe size='extra-large' style={{ color: 'var(--semi-color-primary)' }} />
            </div>
            <div>
              <Text type='tertiary' size='small'>平台总余额（未消耗）</Text>
              {loading ? <Spin size='middle' className='mt-2' /> : (
                <div className='mt-1 font-bold' style={{ fontSize: 22, fontFamily: 'monospace', color: 'var(--semi-color-primary)' }}>
                  {symbol} {qToDisplay(data?.total_remaining_quota ?? 0)}
                </div>
              )}
              <Text type='quaternary' size='small' className='mt-1 block'>
                所有用户当前账户余额之和（实时）
              </Text>
            </div>
          </div>
        </Card>

        <Card className='!rounded-2xl' shadows='hover'>
          <div className='flex items-start gap-3'>
            <div
              className='rounded-xl flex items-center justify-center flex-shrink-0'
              style={{ width: 40, height: 40, background: 'var(--semi-color-warning)18' }}
            >
              <IconGift size='extra-large' style={{ color: 'var(--semi-color-warning)' }} />
            </div>
            <div>
              <Text type='tertiary' size='small'>本月免费发放积分</Text>
              {loading ? <Spin size='middle' className='mt-2' /> : (
                <div className='mt-1 font-bold' style={{ fontSize: 22, fontFamily: 'monospace', color: 'var(--semi-color-warning)' }}>
                  {symbol} {qToDisplay(data?.gift_quota ?? 0)}
                </div>
              )}
              <Text type='quaternary' size='small' className='mt-1 block'>
                本月赠送的潜在履约成本
              </Text>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default OperationsDashboard;
