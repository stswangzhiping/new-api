import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

import type {
  BillingRecord,
  BillingRedemption,
  BillingUser,
  ModelBreakdownItem,
} from './types'

const SOURCE_LABEL: Record<number, string> = {
  0: '未知',
  1: '活动赠送',
  2: '用户购买',
  3: '调账',
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[<>:"/\\|?*]+/g, '_').trim() || 'user'
}

export function formatBillingAmount(quota = 0) {
  const quotaPerUnit = Number(localStorage.getItem('quota_per_unit')) || 500000
  return (quota / quotaPerUnit).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseBreakdown(value?: string): ModelBreakdownItem[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function maskKey(key: string) {
  if (!key || key.length <= 8) return key
  return `${key.slice(0, 4)}····${key.slice(-4)}`
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
}

function buildBillingHtml(
  record: BillingRecord,
  user: BillingUser,
  topups: BillingRedemption[]
) {
  const breakdown = parseBreakdown(record.model_breakdown)
  const topupRows = topups.length
    ? topups
        .map(
          (item) => `<tr>
            <td class="mono">${escapeHtml(formatTime(item.redeemed_time))}</td>
            <td class="mono">${escapeHtml(maskKey(item.key))}</td>
            <td>${escapeHtml(item.name || '-')}</td>
            <td class="number income">${escapeHtml(formatBillingAmount(item.quota))}</td>
            <td>${escapeHtml(SOURCE_LABEL[item.cc_source ?? 0] || '未知')}</td>
          </tr>`
        )
        .join('')
    : '<tr><td class="empty" colspan="5">本月暂无充值记录</td></tr>'
  const breakdownRows = breakdown.length
    ? breakdown
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.model || '-')}</td>
            <td class="number">${escapeHtml(item.calls.toLocaleString())}</td>
            <td class="number">${escapeHtml(item.promptTokens.toLocaleString())}</td>
            <td class="number">${escapeHtml(item.completionTokens.toLocaleString())}</td>
            <td class="number expense">${escapeHtml(formatBillingAmount(item.quota))}</td>
          </tr>`
        )
        .join('')
    : '<tr><td class="empty" colspan="5">暂无模型消费明细</td></tr>'
  const username = user.username || String(record.user_id)
  const displayName = user.display_name || username

  return `<div class="billing-document">
    <header>
      <div>
        <h1>月度账单</h1>
        <div class="period">账单周期：${record.year}年${record.month}月</div>
      </div>
      <div class="generated">
        <div>生成时间：${escapeHtml(formatTime(record.generated_at))}</div>
        <div>金额单位：$</div>
      </div>
    </header>
    <div class="user-bar">
      <div><span>用户姓名</span><strong>${escapeHtml(displayName)}</strong></div>
      <div><span>账号</span><strong>${escapeHtml(username)}</strong></div>
    </div>
    <section>
      <h2>一、账单摘要</h2>
      <div class="summary">
        <div><span>上月结余 ($)</span><strong>${formatBillingAmount(record.opening_quota)}</strong></div>
        <div><span>本月充值 ($)</span><strong class="income">${record.topup_total > 0 ? '+' : ''}${formatBillingAmount(record.topup_total)}</strong><small>购买 ${formatBillingAmount(record.topup_purchase)} · 赠送 ${formatBillingAmount(record.topup_gift)}</small></div>
        <div><span>本月消费 ($)</span><strong class="expense">${formatBillingAmount(record.used_quota)}</strong></div>
        <div><span>本月结余 ($)</span><strong class="primary">${formatBillingAmount(record.closing_quota)}</strong></div>
      </div>
    </section>
    <section>
      <h2>二、本月充值明细</h2>
      <table><thead><tr><th>时间</th><th>兑换码</th><th>名称</th><th class="number">金额 ($)</th><th>来源</th></tr></thead><tbody>${topupRows}</tbody></table>
    </section>
    <section>
      <h2>三、模型消费明细</h2>
      <table><thead><tr><th>模型</th><th class="number">调用次数</th><th class="number">输入 tokens</th><th class="number">输出 tokens</th><th class="number">花费 ($)</th></tr></thead><tbody>${breakdownRows}</tbody></table>
    </section>
    <footer>CUTOS.AI</footer>
  </div>`
}

const PDF_STYLES = `<style>
  * { box-sizing: border-box; }
  .billing-document { width: 794px; padding: 48px 56px; color: #303133; background: #fff; font: 13px -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
  header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 24px; color: #1a1a2e; }
  .period { margin-top: 5px; color: #6366f1; font-weight: 600; }
  .generated { color: #606266; text-align: right; line-height: 1.8; }
  .user-bar { display: flex; gap: 56px; padding: 14px 20px; margin-bottom: 28px; border-radius: 8px; background: #f5f7fa; }
  .user-bar span, .summary span { display: block; margin-bottom: 4px; color: #909399; font-size: 11px; }
  .user-bar strong { font-size: 13px; }
  section { margin-bottom: 30px; break-inside: avoid; }
  h2 { margin: 0 0 14px; border-left: 3px solid #6366f1; padding-left: 10px; font-size: 14px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .summary > div { min-height: 82px; padding: 14px; border-radius: 8px; background: #f5f7fa; }
  .summary strong { display: block; font-size: 20px; }
  .summary small { display: block; margin-top: 5px; color: #909399; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 9px 10px; border-bottom: 1px solid #dcdfe6; background: #f5f7fa; color: #606266; text-align: left; font-size: 11px; }
  td { padding: 8px 10px; border-bottom: 1px solid #ebeef5; font-size: 11px; }
  .number { text-align: right; }
  .mono { font-family: Consolas, monospace; }
  .income { color: #16a34a; }
  .expense { color: #dc2626; }
  .primary { color: #6366f1; }
  .empty { padding: 20px; color: #909399; text-align: center; }
  footer { margin-top: 30px; border-top: 1px solid #ebeef5; padding-top: 10px; color: #c0c4cc; text-align: center; }
</style>`

export async function downloadBillingPdf(options: {
  record: BillingRecord
  user: BillingUser
  topups: BillingRedemption[]
}) {
  const { record, user, topups } = options
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.innerHTML = `${PDF_STYLES}${buildBillingHtml(record, user, topups)}`
  document.body.appendChild(container)

  try {
    await document.fonts?.ready
    const element = container.querySelector('.billing-document') as HTMLElement
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = 210
    const pageHeight = 297
    const imageHeight = (canvas.height * pageWidth) / canvas.width
    const image = canvas.toDataURL('image/png')
    let remaining = imageHeight
    let y = 0

    pdf.addImage(image, 'PNG', 0, y, pageWidth, imageHeight)
    remaining -= pageHeight
    while (remaining > 0) {
      y = remaining - imageHeight
      pdf.addPage()
      pdf.addImage(image, 'PNG', 0, y, pageWidth, imageHeight)
      remaining -= pageHeight
    }

    const account = user.username || String(record.user_id)
    pdf.save(
      `月度账单-${record.year}年${record.month}月-${sanitizeFileNamePart(account)}.pdf`
    )
  } finally {
    container.remove()
  }
}
