import React from 'react';
import { render } from '@testing-library/react-native';
import {
  HourglassIcon,
  CoinIcon,
  CheckIcon,
  TargetIcon,
  WaveIcon,
  HomeIcon,
  WalletIcon,
  StarIcon,
  SparkleIcon,
} from '../TaskIcons';

describe('TaskIcons', () => {
  it('renders HourglassIcon', () => {
    expect(render(<HourglassIcon size={28} />).toJSON()).not.toBeNull();
  });
  it('renders CoinIcon', () => {
    expect(render(<CoinIcon size={28} />).toJSON()).not.toBeNull();
  });
  it('renders CheckIcon', () => {
    expect(render(<CheckIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders TargetIcon', () => {
    expect(render(<TargetIcon size={44} />).toJSON()).not.toBeNull();
  });
  it('renders WaveIcon', () => {
    expect(render(<WaveIcon />).toJSON()).not.toBeNull();
  });
  it('renders HomeIcon', () => {
    expect(render(<HomeIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders WalletIcon', () => {
    expect(render(<WalletIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders StarIcon', () => {
    expect(render(<StarIcon size={24} />).toJSON()).not.toBeNull();
  });
  it('renders SparkleIcon', () => {
    expect(render(<SparkleIcon size={24} />).toJSON()).not.toBeNull();
  });
});
