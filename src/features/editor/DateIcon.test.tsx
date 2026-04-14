import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DateIcon from './DateIcon';

describe('DateIcon (M7-T3)', () => {
  it('renders an SVG with viewBox 0 0 16 16', () => {
    const { container } = render(<DateIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('uses currentColor for stroke (inherits parent color)', () => {
    const { container } = render(<DateIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('is aria-hidden (button provides the accessible label)', () => {
    const { container } = render(<DateIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders calendar-like shapes: rect + 3 lines', () => {
    const { container } = render(<DateIcon />);
    expect(container.querySelectorAll('rect').length).toBe(1);
    expect(container.querySelectorAll('line').length).toBe(3);
  });

  it('passes className through', () => {
    const { container } = render(<DateIcon className="my-class" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('my-class');
  });
});
