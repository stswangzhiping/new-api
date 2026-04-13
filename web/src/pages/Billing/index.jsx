import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Form,
  Empty,
  Typography,
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

// ─── 主组件 ────────────────────────────────────────────────────────────────────
const BillingPage = () => {
  const { t }  = useTranslation();
  const isMobile = useIsMobile();
  const admin    = isAdmin();

  const [records,     setRecords]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [usernameMap, setUsernameMap] = useState({});
  const [formApi,     setFormApi]     = useState(null);

  const { symbol } = getCurrencyInfo();

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

        // 客户端用户名过滤
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

        setRecords(items.map((r, i) => ({ ...r, key: r.id ?? i })));
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [admin, formApi, usernameMap],
  );

  useEffect(() => {
    loadUsers().then(() => load(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (admin && Object.keys(usernameMap).length > 0) load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameMap]);

  // 展开行：模型明细
  const expandRowRender = (record) => {
    const items = parseBreakdown(record.model_breakdown);
    if (!items.length) return <Text type='tertiary' style={{ padding: 8 }}>{t('暂无模型明细')}</Text>;
    return (
      <div style={{ padding: '8px 16px' }}>
        <Table
          columns={[
            {
              title: t('模型'),
              dataIndex: 'model',
              render: (v) => <Tag color='violet' size='small'>{v}</Tag>,
            },
            { title: t('调用次数'), dataIndex: 'calls', align: 'right', width: 90, render: (v) => v?.toLocaleString() },
            { title: t('输入 tokens'), dataIndex: 'promptTokens', align: 'right', width: 110, render: (v) => v?.toLocaleString() },
            { title: t('输出 tokens'), dataIndex: 'completionTokens', align: 'right', width: 110, render: (v) => v?.toLocaleString() },
            {
              title: `${t('花费')} (${symbol})`,
              dataIndex: 'quota',
              align: 'right',
              width: 110,
              render: (v) => (
                <Text style={{ color: 'var(--semi-color-danger)' }}>{qToNum(v)}</Text>
              ),
            },
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
      title: t('月份'),
      dataIndex: 'year',
      width: 100,
      render: (_, row) => (
        <Text strong style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {monthStr(row.year, row.month)}
        </Text>
      ),
    },
    ...(admin
      ? [{
          title: t('用户名称'),
          dataIndex: 'user_id',
          width: 120,
          render: (v) => <Text>{usernameMap[v] || String(v)}</Text>,
        }]
      : []),
    {
      title: `${t('上月结余')} (${symbol})`,
      dataIndex: 'opening_quota',
      align: 'right',
      width: 140,
      render: (v) => (
        <Text className='font-mono text-xs' style={{ color: 'var(--semi-color-text-2)' }}>
          {qToNum(v)}
        </Text>
      ),
    },
    {
      title: `${t('本月充值')} (${symbol})`,
      dataIndex: 'topup_total',
      align: 'right',
      width: 180,
      render: (v, row) =>
        v > 0 ? (
          <div style={{ textAlign: 'right' }}>
            <Text style={{ color: 'var(--semi-color-success)', fontWeight: 600 }}>
              +{qToNum(v)}
            </Text>
            {(row.topup_purchase > 0 || row.topup_gift > 0) && (
              <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)', marginTop: 2 }}>
                {row.topup_purchase > 0 && <span style={{ marginRight: 4 }}>{t('购买')} {qToNum(row.topup_purchase)}</span>}
                {row.topup_gift > 0 && <span>{t('赠送')} {qToNum(row.topup_gift)}</span>}
              </div>
            )}
          </div>
        ) : (
          <Text type='tertiary'>—</Text>
        ),
    },
    {
      title: `${t('本月消费')} (${symbol})`,
      dataIndex: 'used_quota',
      align: 'right',
      width: 140,
      render: (v) => (
        <Text
          className='font-mono text-xs'
          style={{ color: v > 0 ? 'var(--semi-color-danger)' : undefined }}
        >
          {qToNum(v)}
        </Text>
      ),
    },
    {
      title: `${t('本月结余')} (${symbol})`,
      dataIndex: 'closing_quota',
      align: 'right',
      width: 140,
      render: (v) => (
        <Text strong style={{ color: 'var(--semi-color-primary)', fontFamily: 'monospace' }}>
          {qToNum(v)}
        </Text>
      ),
    },
    {
      title: t('生成时间'),
      dataIndex: 'generated_at',
      align: 'right',
      width: 160,
      render: (v) => (
        <Text className='font-mono text-xs' style={{ color: 'var(--semi-color-text-3)' }}>
          {formatTs(v)}
        </Text>
      ),
    },
  ];

  const filtersArea = admin ? (
    <Form
      getFormApi={(api) => setFormApi(api)}
      onSubmit={() => load('')}
      allowEmpty
      autoComplete='off'
      layout='vertical'
      stopValidateWithError={false}
    >
      <div className='flex flex-col gap-2'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
          <Form.Input
            field='username'
            prefix={<IconSearch />}
            placeholder={t('用户名称')}
            showClear
            pure
            size='small'
          />
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
              onClick={() => { formApi?.reset(); setTimeout(() => load(''), 50); }}
            >
              {t('重置')}
            </Button>
          </div>
        </div>
      </div>
    </Form>
  ) : null;

  return (
    <div className='mt-[60px] px-2 mx-auto' style={{ maxWidth: 1400, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardPro
        type='type2'
        searchArea={filtersArea}
        t={t}
      >
        <Table
          columns={columns}
          dataSource={records}
          rowKey='key'
          loading={loading}
          size='small'
          pagination={false}
          expandedRowRender={expandRowRender}
          expandRowByClick
          rowExpandable={(r) => parseBreakdown(r.model_breakdown).length > 0}
          scroll={{ x: 'max-content' }}
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
