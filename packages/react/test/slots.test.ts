import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allGames, arcadeTheme, ButtonSlotProps, SageGameProvider, ui, useSage } from '@sagegames/react';

const render = (props: Record<string, unknown>, child: ReturnType<typeof h>) =>
  renderToStaticMarkup(h(SageGameProvider, { games: allGames, ...props } as never, child));

describe('slots', () => {
  it('replaces every Button with the host component, with platform-neutral props', () => {
    const MyButton = ({ label, variant, onPress }: ButtonSlotProps) => h('a', { 'data-variant': variant, 'data-has-press': typeof onPress === 'function' }, `[${label}]`);
    const html = render({ components: { Button: MyButton } }, h(ui.Button, { label: 'Play', onClick: () => undefined, variant: 'ghost' }));
    expect(html).toContain('[Play]');
    expect(html).toContain('data-variant="ghost"');
    expect(html).toContain('data-has-press="true"');
    expect(html).not.toContain('<button');
  });

  it('applies slot styles after the SDK styles', () => {
    const html = render({ slotStyles: { card: { borderRadius: 3 }, chip: { textTransform: 'uppercase' } } }, h('div', null, h(ui.Surface, null, 'x'), h(ui.Chip, { label: 'hi' })));
    expect(html).toContain('border-radius:3px');
    expect(html).toContain('text-transform:uppercase');
  });

  it('defaults to the arcade theme and fills in partial themes', () => {
    let seen: unknown;
    const Probe = () => {
      seen = useSage().theme;
      return null;
    };
    render({}, h(Probe));
    expect(seen).toEqual(arcadeTheme);
    render({ theme: { colors: { primary: '#ff0000' } } }, h(Probe));
    expect((seen as typeof arcadeTheme).gradients.primary[0]).toBe('#ff0000');
    expect((seen as typeof arcadeTheme).typography).toEqual(arcadeTheme.typography);
  });
});
