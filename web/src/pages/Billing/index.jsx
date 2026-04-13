import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Form,
  Empty,
  Typography,
  Descriptions,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { API, showError } from '../../helpers';
import { isAdmin } from '../../helpers/utils';
import { renderQuota } from '../../helpers/render';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

function monthStr(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatTs(ts) {
  if (!ts || ts <= 0) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function parseBreakdown(json) {
  try {
    return JSON.parse(json || '[]');
  } catch {
    return [];
  }
}

const BillingPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const admin = isAdmin();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userIdFilter, setUserIdFilter] = useState('');

  const load = useCallback(
    async (uid) => {
      setLoading(true);
      try {
        const url = admin
          ? `/api/billing/${uid ? `?user_id=${uid}` : ''}`
          : '/api/billing/self';
        const res = await API.get(url);
        const { success, message, data } = res.data;
        if (!success) {
          showError(message);
          return;
        }
        // admin returns paginated; self returns array
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setRecords(items.map((r, i) => ({ ...r, key: r.id ?? i })));
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [admin],
  );

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expandRowRender = (record) => {
    const items = parseBreakdown(record.model_breakdown);
    if (!items.length) return <Text type='tertiary'>{t('暂无模型明细')}</Text>;
    return (
      <div className='py-2 px-4'>
        <Table
          columns={[
            {
              title: t('模型'),
              dataIndex: 'model',
              render: (v) => (
                <Tag color='violet' size='small'>
                  {v}
                </Tag>
              ),
            },
            {
              title: t('调用次数'),
              dataIndex: 'calls',
              align: 'right',
              width: 90,
              render: (v) => v?.toLocaleString(),
            },
            {
              title: t('输入 tokens'),
              dataIndex: 'promptTokens',
              align: 'right',
              width: 110,
              render: (v) => v?.toLocaleString(),
            },
            {
              title: t('输出 tokens'),
              dataIndex: 'completionTokens',
              align: 'right',
              width: 110,
              render: (v) => v?.toLocaleString(),
            },
            {
              title: t('花费'),
              dataIndex: 'quota',
              align: 'right',
              width: 110,
              render: (v) => (
                <Text style={{ color: 'var(--semi-color-danger)' }}>
                  {renderQuota(v)}
                </Text>
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
      width: 130,
      render: (_, row) => (
        <Text strong style={{ whiteSpace: 'nowrap' }}>{monthStr(row.year, row.month)}</Text>
      ),
    },
    ...(admin
      ? [
          {
            title: t('用户 ID'),
            dataIndex: 'user_id',
            width: 90,
          },
        ]
      : []),
    {
      title: t('上月结余'),
      dataIndex: 'opening_quota',
      align: 'right',
      width: 120,
      render: (v) => (
        <Text className='font-mono text-xs text-[var(--semi-color-text-2)]'>
          {renderQuota(v)}
        </Text>
      ),
    },
    {
      title: t('本月充值'),
      dataIndex: 'topup_total',
      align: 'right',
      width: 140,
      render: (v, row) =>
        v > 0 ? (
          <div className='text-right'>
            <Text style={{ color: 'var(--semi-color-success)', fontWeight: 600 }}>
              +{renderQuota(v)}
            </Text>
            {(row.topup_purchase > 0 || row.topup_gift > 0) && (
              <div className='text-xs text-[var(--semi-color-text-3)] mt-0.5'>
                {row.topup_purchase > 0 && (
                  <span className='mr-1'>
                    {t('购买')} {renderQuota(row.topup_purchase)}
                  </span>
                )}
                {row.topup_gift > 0 && (
                  <span>{t('赠送')} {renderQuota(row.topup_gift)}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <Text type='tertiary'>—</Text>
        ),
    },
    {
      title: t('本月消费'),
      dataIndex: 'used_quota',
      align: 'right',
      width: 120,
      render: (v) => (
        <Text
          className='font-mono text-xs'
          style={{ color: v > 0 ? 'var(--semi-color-danger)' : undefined }}
        >
          {renderQuota(v)}
        </Text>
      ),
    },
    {
      title: t('本月结余'),
      dataIndex: 'closing_quota',
      align: 'right',
      width: 120,
      render: (v) => (
        <Text
          strong
          style={{ color: 'var(--semi-color-primary)', fontFamily: 'monospace' }}
        >
          {renderQuota(v)}
        </Text>
      ),
    },
    {
      title: t('生成时间'),
      dataIndex: 'generated_at',
      align: 'right',
      width: 160,
      render: (v) => (
        <Text className='font-mono text-xs text-[var(--semi-color-text-3)]'>
          {formatTs(v)}
        </Text>
      ),
    },
  ];

  const filtersArea = admin ? (
    <div className='flex gap-2 items-center'>
      <Form.Input
        noLabel
        size='small'
        placeholder={t('用户 ID')}
        value={userIdFilter}
        onChange={(v) => setUserIdFilter(v)}
        style={{ width: 120 }}
      />
      <Button
        size='small'
        type='tertiary'
        loading={loading}
        onClick={() => load(userIdFilter.trim())}
      >
        {t('查询')}
      </Button>
      <Button
        size='small'
        type='tertiary'
        onClick={() => {
          setUserIdFilter('');
          load('');
        }}
      >
        {t('重置')}
      </Button>
    </div>
  ) : null;

  return (
    <div className='mt-[60px] px-2'>
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
          scroll={isMobile ? undefined : { x: 'max-content' }}
          className='rounded-xl overflow-hidden'
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark
                  style={{ width: 150, height: 150 }}
                />
              }
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
