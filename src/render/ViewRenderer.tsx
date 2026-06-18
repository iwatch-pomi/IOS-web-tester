import { useState, type CSSProperties } from 'react';
import type { ResolvedStyle, ViewNode } from '../interpreter/viewNode';
import type { StateStore } from '../interpreter/stateStore';
import { lookupSymbol } from './sfSymbols';

export interface RenderCtx {
  actions: Map<string, () => void>;
  store: StateStore;
}

function toCss(style: ResolvedStyle): CSSProperties {
  return style.css as CSSProperties;
}

export function RenderNodes({ nodes, ctx }: { nodes: ViewNode[]; ctx: RenderCtx }) {
  return (
    <>
      {nodes.map((n, i) => (
        <RenderNode key={i} node={n} ctx={ctx} />
      ))}
    </>
  );
}

function Sheet({ style, ctx }: { style: ResolvedStyle; ctx: RenderCtx }) {
  if (!style.sheet) return null;
  const presented = !!ctx.store.get(style.sheet.bindingPath);
  if (!presented) return null;
  return (
    <div className="sheet-backdrop" onClick={() => ctx.store.set(style.sheet!.bindingPath, false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <button className="sheet-close" onClick={() => ctx.store.set(style.sheet!.bindingPath, false)}>
          閉じる
        </button>
        <div className="sheet-body">
          <RenderNodes nodes={style.sheet.content} ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function withTap(node: ViewNode, ctx: RenderCtx, children: React.ReactNode) {
  const tapId = node.style.tapActionId;
  if (!tapId) return children;
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => ctx.actions.get(tapId)?.()}>
      {children}
    </div>
  );
}

function RenderNode({ node, ctx }: { node: ViewNode; ctx: RenderCtx }) {
  switch (node.type) {
    case 'text':
      return withTap(
        node,
        ctx,
        <span style={{ ...toCss(node.style), whiteSpace: 'pre-wrap' }}>
          {node.text}
          <Sheet style={node.style} ctx={ctx} />
        </span>,
      );

    case 'image': {
      const { Icon, filled } = lookupSymbol(node.symbol);
      const css = toCss(node.style);
      const size = (css.fontSize as string) ?? '20px';
      const sizeNum = parseInt(String(size)) || 20;
      if (Icon) {
        return withTap(
          node,
          ctx,
          <span style={{ display: 'inline-flex', ...css }}>
            <Icon size={sizeNum * 1.1} fill={filled ? 'currentColor' : 'none'} />
            <Sheet style={node.style} ctx={ctx} />
          </span>,
        );
      }
      // Unknown symbol -> labelled placeholder chip
      return (
        <span className="symbol-fallback" style={css} title={`SF Symbol: ${node.symbol}`}>
          ◌ {node.symbol}
        </span>
      );
    }

    case 'spacer':
      return <div style={{ flex: 1, ...toCss(node.style) }} />;

    case 'divider':
      return <div className="divider" style={toCss(node.style)} />;

    case 'stack': {
      const css = toCss(node.style);
      const base: CSSProperties =
        node.axis === 'z'
          ? { display: 'grid' }
          : {
              display: 'flex',
              flexDirection: node.axis === 'h' ? 'row' : 'column',
              alignItems: alignItems(node.axis, node.alignment),
              gap: node.spacing != null ? `${node.spacing}px` : '8px',
            };
      if (node.scroll) {
        base.overflow = 'auto';
        if (node.axis === 'v') base.maxHeight = '100%';
      }
      if (node.axis === 'z') {
        return (
          <div style={{ ...base, ...css, position: 'relative' }}>
            {node.children.map((c, i) => (
              <div key={i} style={{ gridArea: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RenderNode node={c} ctx={ctx} />
              </div>
            ))}
            <Sheet style={node.style} ctx={ctx} />
          </div>
        );
      }
      return (
        <div style={{ ...base, ...css }}>
          <RenderNodes nodes={node.children} ctx={ctx} />
          <Sheet style={node.style} ctx={ctx} />
        </div>
      );
    }

    case 'button':
      return (
        <button
          className="sw-button"
          style={toCss(node.style)}
          onClick={() => (node.actionId ? ctx.actions.get(node.actionId)?.() : undefined)}
        >
          <RenderNodes nodes={node.label} ctx={ctx} />
          <Sheet style={node.style} ctx={ctx} />
        </button>
      );

    case 'toggle':
      return (
        <label className="sw-toggle" style={toCss(node.style)}>
          <span className="sw-toggle-label">
            <RenderNodes nodes={node.label} ctx={ctx} />
          </span>
          <input
            type="checkbox"
            checked={node.value}
            onChange={(e) => node.bindingPath && ctx.store.set(node.bindingPath, e.target.checked)}
          />
          <span className="sw-switch" data-on={node.value} />
        </label>
      );

    case 'textfield':
      return (
        <input
          className="sw-textfield"
          style={toCss(node.style)}
          type={node.secure ? 'password' : 'text'}
          placeholder={node.placeholder}
          value={node.value}
          onChange={(e) => node.bindingPath && ctx.store.set(node.bindingPath, e.target.value)}
        />
      );

    case 'list':
      return (
        <div className="sw-list" style={toCss(node.style)}>
          {node.children.map((c, i) => (
            <div className="sw-list-row" key={i}>
              <RenderNode node={c} ctx={ctx} />
            </div>
          ))}
        </div>
      );

    case 'navStack':
      return <NavStackView node={node} ctx={ctx} />;

    case 'navLink':
      return <NavLinkView node={node} ctx={ctx} />;

    case 'unsupported':
      return (
        <div className="unsupported-node" title="このビューはプレビュー未対応です（実機ではコンパイルできる場合があります）">
          ⚠ 未対応: {node.label}
        </div>
      );
  }
}

function NavStackView({ node, ctx }: { node: Extract<ViewNode, { type: 'navStack' }>; ctx: RenderCtx }) {
  return (
    <div className="nav-stack" style={toCss(node.style)}>
      <div className="nav-bar">{node.title ?? ''}</div>
      <div className="nav-content">
        <RenderNodes nodes={node.children} ctx={ctx} />
      </div>
    </div>
  );
}

function NavLinkView({ node, ctx }: { node: Extract<ViewNode, { type: 'navLink' }>; ctx: RenderCtx }) {
  const [pushed, setPushed] = useState(false);
  if (pushed) {
    return (
      <div className="nav-pushed">
        <button className="nav-back" onClick={() => setPushed(false)}>
          ‹ 戻る
        </button>
        <RenderNodes nodes={node.destination} ctx={ctx} />
      </div>
    );
  }
  return (
    <button className="nav-link-row" style={toCss(node.style)} onClick={() => setPushed(true)}>
      <span>
        <RenderNodes nodes={node.label} ctx={ctx} />
      </span>
      <span className="nav-chevron">›</span>
    </button>
  );
}

function alignItems(axis: 'v' | 'h' | 'z', alignment: string | null): string {
  if (axis === 'v') {
    if (alignment === 'leading') return 'flex-start';
    if (alignment === 'trailing') return 'flex-end';
    return 'center';
  }
  // horizontal stack default is vertical-center
  if (alignment === 'top') return 'flex-start';
  if (alignment === 'bottom') return 'flex-end';
  return 'center';
}
