import { lazy } from 'react';

export const LazyTMGraphWrapper = lazy(async () => {
  const module = await import('@components/TMGraph/TMGraph');
  return { default: module.TMGraphWrapper };
});

export const LazyConfigGraphWrapper = lazy(async () => {
  const module = await import('@components/ConfigGraph/ConfigGraph');
  return { default: module.ConfigGraphWrapper };
});

export const LazyComputationTreeWrapper = lazy(async () => {
  const module = await import('@components/ComputationTree/ComputationTree');
  return { default: module.ComputationTreeWrapper };
});

export const LazyRunChoiceDialog = lazy(async () => {
  const module = await import('@components/MainPage/RunChoiceDialog');
  return { default: module.RunChoiceDialog };
});
