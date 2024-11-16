import { DotButton, useDotButton } from "./components/EmblaCarouselDotButton";
import {
    PrevButton,
    NextButton,
    usePrevNextButtons,
} from "./components/EmblaCarouselArrowButtons";
import useEmblaCarousel from "embla-carousel-react";

import "./EmblaCarousel.css";

export function EmblaCarousel({ images }) {
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

    const { selectedIndex, scrollSnaps, onDotButtonClick } =
        useDotButton(emblaApi);

    const {
        prevBtnDisabled,
        nextBtnDisabled,
        onPrevButtonClick,
        onNextButtonClick,
    } = usePrevNextButtons(emblaApi);

    return (
        <section className="embla">
            <div className="embla__viewport" ref={emblaRef}>
                <div className="embla__container">
                    {images.map((image, index) => (
                        <div className="embla__slide" key={index}>
                            <img src={image} alt={`Image ${index}`} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="embla__controls">
                <div className="embla__buttons">
                    <PrevButton
                        onClick={onPrevButtonClick}
                        disabled={prevBtnDisabled}
                    />
                    <NextButton
                        onClick={onNextButtonClick}
                        disabled={nextBtnDisabled}
                    />
                </div>

                <div className="embla__dots">
                    {scrollSnaps.map((_, index) => (
                        <DotButton
                            key={index}
                            onClick={() => onDotButtonClick(index)}
                            className={"embla__dot".concat(
                                index === selectedIndex
                                    ? " embla__dot--selected"
                                    : ""
                            )}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
