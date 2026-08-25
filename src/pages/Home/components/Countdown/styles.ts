import styled from 'styled-components'

export const CountdownWrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
`

export const CountdownContainer = styled.div`
  font-family: 'Roboto Mono', monospace;
  font-size: clamp(3.5rem, 12vw, 10rem);
  line-height: 0.8;
  color: ${(props) => props.theme['gray-100']};

  display: flex;
  gap: clamp(0.4rem, 2vw, 1rem);

  span {
    background: ${(props) => props.theme['gray-700']};
    padding: 2rem 1rem;
    border-radius: 8px;
  }
`

export const Separator = styled.div`
  padding: 2rem 0;
  color: ${(props) => props.theme['green-500']};
  width: clamp(1.5rem, 4vw, 4rem);
  overflow: hidden;
  display: flex;
  justify-content: center;
`

export const ProgressBar = styled.div<{ $progress: number }>`
  width: 100%;
  max-width: 42rem;
  height: 0.4rem;
  background: ${(props) => props.theme['gray-700']};
  border-radius: 999px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${(props) => props.$progress}%;
    background: ${(props) => props.theme['green-500']};
    transition: width 0.4s linear;
  }
`
