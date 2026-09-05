import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
} from 'react';

type HelmetProps = {
  children?: ReactNode;
};

type HelmetProviderProps = {
  children?: ReactNode;
};

type HeadElementProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

const applyAttributes = (element: HTMLElement, props: HeadElementProps) => {
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children' || value === undefined || value === null) {
      return;
    }
    element.setAttribute(key, String(value));
  });
};

const createHeadElement = (tagName: 'meta' | 'link', props: HeadElementProps) => {
  const element = document.createElement(tagName);
  const attributes = { ...props };
  delete attributes.children;
  applyAttributes(element, attributes);
  document.head.append(element);
  return element;
};

const extractTitle = (nodeChildren: ReactNode): string => {
  if (typeof nodeChildren === 'string') {
    return nodeChildren;
  }
  const parts = Children.toArray(nodeChildren)
    .map((child) => (typeof child === 'string' ? child : ''))
    .filter(Boolean);
  return parts.join(' ');
};

export const HelmetProvider = ({ children }: HelmetProviderProps) => {
  return <Fragment>{children}</Fragment>;
};

export const Helmet = ({ children }: HelmetProps) => {
  useEffect(() => {
    const nodes = Children.toArray(children).filter(isValidElement);
    const managedElements: HTMLElement[] = [];

    nodes.forEach((node) => {
      const { type, props } = node as ReactElement<HeadElementProps>;
      if (type === 'title') {
        const nextTitle = extractTitle(props.children);
        if (nextTitle) {
          document.title = nextTitle;
        }
      } else if (type === 'meta' || type === 'link') {
        managedElements.push(createHeadElement(type, props));
      }
    });

    return () => {
      managedElements.forEach((element) => {
        if (element.parentElement) {
          element.parentElement.removeChild(element);
        }
      });
    };
  }, [children]);

  return null;
};

export default Helmet;
