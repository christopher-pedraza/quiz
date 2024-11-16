import {
    Card,
    CardBody,
    Button,
    CheckboxGroup,
    Checkbox,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure,
} from "@nextui-org/react";

import { useState } from "react";

import ImageGallery from "react-image-gallery";

import { EmblaCarousel } from "./components/EmblaCarousel/EmblaCarousel";

function Question({ question_data }) {
    const { question, answers, explanation, images } = question_data;
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const [showAnswerStatus, setShowAnswerStatus] = useState(false);

    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    let galleryImages = null;

    const checkAnswers = () => {
        setShowAnswerStatus(true);
    };

    const onAnswerChange = (newSelectedValues) => {
        setShowAnswerStatus(false);
        setSelectedAnswers(newSelectedValues);
    };

    // if (images) {
    //     // Create an array of objects with the key original and the value the
    //     // src of the image
    //     galleryImages = [];
    //     images.forEach((image) => {
    //         galleryImages.push({ original: image });
    //     });
    //     console.log(galleryImages);
    // }

    return (
        <>
            <Card>
                <CardBody>
                    <p>
                        <strong>{question}</strong>
                    </p>
                    {answers && (
                        <CheckboxGroup onValueChange={onAnswerChange}>
                            {answers.map((answer, index) => (
                                <Checkbox key={index} value={index}>
                                    {showAnswerStatus &&
                                    selectedAnswers.includes(index) ? (
                                        answer.is_correct ? (
                                            <span className="text-green-500">
                                                {answer.answer}
                                            </span>
                                        ) : (
                                            <span className="text-red-500">
                                                {answer.answer}
                                            </span>
                                        )
                                    ) : (
                                        answer.answer
                                    )}
                                </Checkbox>
                            ))}
                        </CheckboxGroup>
                    )}
                </CardBody>
            </Card>
            <Button onPress={checkAnswers}>Checar</Button>
            <Button onPress={onOpen} disabled={!galleryImages}>
                Imagenes
            </Button>
            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                size="3xl"
                className="dark text-foreground bg-background border border-white"
            >
                <ModalContent>
                    {(onClose) => (
                        <div className="w-full overflow-hidden">
                            <EmblaCarousel images={images} />
                        </div>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
}

export default Question;
